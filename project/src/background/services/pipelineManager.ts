// src/background/services/pipelineManager.ts
import { logger } from '../logger';
import {
  RunState,
  PostState,
  Comment,
  ChatMessage,
  UIState,
} from '../../shared/types';
import { getPostState, savePostState } from './stateManager';
import { getConfig } from './configManager';
import { OpenRouterClient } from './openRouterClient';

// Internal state for the pipeline
let pipelineStatus: RunState = 'idle';
let activePostUrn: string | null = null;
let activeTabId: number | null = null;
let isProcessing = false; // A lock to prevent concurrent processing loops

// This will be set by the main service worker script to broadcast updates
let broadcastState: (state: Partial<UIState>) => void = () => {
  logger.warn('broadcastState not initialized in PipelineManager');
};

// This will be set by the main service worker script to send messages to content scripts
let sendMessageToTab: <T>(
  tabId: number,
  message: { type: string; payload?: unknown }
) => Promise<T> = async () => {
  logger.warn('sendMessageToTab not initialized in PipelineManager');
  return Promise.reject('sendMessageToTab not initialized');
};

export const initPipelineManager = (
  broadcaster: (state: Partial<UIState>) => void,
  messageSender: <T>(
    tabId: number,
    message: { type: string; payload?: unknown }
  ) => Promise<T>
) => {
  broadcastState = broadcaster;
  sendMessageToTab = messageSender;
  logger.info('PipelineManager initialized.');
};

const findNextComment = (postState: PostState): Comment | null => {
  for (const comment of postState.comments) {
    // First priority: check connection status if unknown
    if (typeof comment.connected === 'undefined') {
      return comment;
    }
    // A comment needs processing if its like or reply status is not 'DONE' or 'FAILED'
    if (comment.likeStatus === '' || comment.replyStatus === '') {
      return comment;
    }
    // New check for DM
    if (comment.connected && comment.dmStatus === '') {
      return comment;
    }
  }
  return null; // No more comments to process
};

const generateReply = async (
  comment: Comment,
  postState: PostState
): Promise<string | null> => {
  const context = {
    postId: postState._meta.postId,
    commentId: comment.commentId,
    step: 'GENERATE_REPLY',
  };
  logger.info('Generating AI reply', context);
  try {
    const aiConfig = getConfig();
    if (!aiConfig.apiKey) {
      logger.error('OpenRouter API key is not set.', undefined, context);
      return null;
    }

    const client = new OpenRouterClient(aiConfig.apiKey, aiConfig.attribution);

    // Note: Some template variables are placeholders for now.
    // In a future task, these would be dynamically populated.
    const systemPrompt = aiConfig.reply.customPrompt; // Simplified for now
    const userMessageContent = `
      Post URL: ${postState._meta.postUrl}
      My persona: ${systemPrompt}
      Original comment (from ${comment.ownerProfileUrl}):
      '${comment.text}'
      Output: ONLY the reply text. If the comment is irrelevant, toxic, or spam, output exactly '__SKIP__'.
    `;

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a helpful LinkedIn engagement assistant. Your goal is to write brief, genuinely specific replies to post comments based on the user-provided persona.',
      },
      { role: 'user', content: userMessageContent },
    ];

    const replyText = await client.createChatCompletion({
      model: aiConfig.model,
      messages,
      temperature: aiConfig.temperature,
      top_p: aiConfig.top_p,
      max_tokens: aiConfig.max_tokens,
    });
    logger.info('AI reply generated successfully', {
      ...context,
      replyTextLength: replyText.length,
    });
    return replyText;
  } catch (error) {
    logger.error('Failed to generate AI reply', error, context);
    return null;
  }
};

const generateDm = async (
  comment: Comment,
  postState: PostState
): Promise<string | null> => {
  const context = {
    postId: postState._meta.postId,
    commentId: comment.commentId,
    step: 'GENERATE_DM',
  };
  logger.info('Generating AI DM', context);
  try {
    const aiConfig = getConfig();
    if (!aiConfig.apiKey) {
      logger.error('OpenRouter API key is not set.', undefined, context);
      return null;
    }

    const client = new OpenRouterClient(aiConfig.apiKey, aiConfig.attribution);

    const userMessageContent = `
      Their comment on my post: '${comment.text}'
      My custom instructions for this DM: ${aiConfig.dm.customPrompt}
      My post URL for context: ${postState._meta.postUrl}
      Commenter Profile URL: ${comment.ownerProfileUrl}
      Output: ONLY the direct message text. Be concise, personable, and professional.
    `;

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a helpful LinkedIn engagement assistant. Your goal is to write a brief, personalized direct message to someone who left a thoughtful comment on your post. Your tone should be warm and aim to start a meaningful conversation.',
      },
      { role: 'user', content: userMessageContent },
    ];

    const dmText = await client.createChatCompletion({
      model: aiConfig.model,
      messages,
      temperature: aiConfig.temperature,
      top_p: aiConfig.top_p,
      max_tokens: aiConfig.max_tokens,
    });
    logger.info('AI DM generated successfully', {
      ...context,
      dmTextLength: dmText.length,
    });
    return dmText;
  } catch (error) {
    logger.error('Failed to generate AI DM', error, context);
    return null;
  }
};

const processComment = async (
  comment: Comment,
  postState: PostState
): Promise<void> => {
  const context = {
    postId: postState._meta.postId,
    commentId: comment.commentId,
  };
  try {
    // STEP 1: Check connection status if it's unknown
    if (typeof comment.connected === 'undefined') {
      const stepContext = { ...context, step: 'CONNECTION_CHECK' };
      logger.info('Attempting to check connection status', {
        ...stepContext,
        profileUrl: comment.ownerProfileUrl,
      });
      let connectionTabId: number | undefined;
      try {
        const tab = await chrome.tabs.create({
          url: comment.ownerProfileUrl,
          active: false,
        });
        connectionTabId = tab.id;
        if (!connectionTabId) {
          throw new Error('Failed to create a new tab for connection check.');
        }

        // Wait for the tab to complete loading with a timeout
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('Tab loading timed out after 30 seconds.'));
          }, 30000);

          const listener = (
            tabId: number,
            changeInfo: chrome.tabs.TabChangeInfo
          ) => {
            if (tabId === connectionTabId && changeInfo.status === 'complete') {
              clearTimeout(timeout);
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });

        const injectionResults = await chrome.scripting.executeScript({
          target: { tabId: connectionTabId },
          func: () => {
            // This function is executed in the context of the new tab
            const distanceBadge = document.querySelector(
              'span.distance-badge .dist-value'
            );
            return !!(
              distanceBadge && distanceBadge.textContent?.trim() === '1st'
            );
          },
        });

        if (injectionResults && injectionResults.length > 0) {
          comment.connected = injectionResults[0].result as boolean;
          logger.info('Connection status determined successfully', {
            ...stepContext,
            connected: comment.connected,
          });
        } else {
          throw new Error('Script injection failed or returned no result.');
        }
      } catch (error) {
        logger.error('Failed to check connection status', error, {
          ...stepContext,
          profileUrl: comment.ownerProfileUrl,
        });
        comment.connected = false; // Default to false on error
        comment.lastError = (error as Error).message;
      } finally {
        if (connectionTabId) {
          await chrome.tabs.remove(connectionTabId);
        }
      }

      await savePostState(postState._meta.postId, postState);
      broadcastState({ comments: postState.comments });
      return; // Atomic step complete
    }

    // STATE: QUEUED -> LIKED
    if (comment.likeStatus === '') {
      const stepContext = { ...context, step: 'LIKE_ATTEMPT' };
      logger.info('Attempting to like comment', stepContext);
      if (!activeTabId) {
        throw new Error('Cannot like comment, active tab ID is not set.');
      }

      const likeSuccess = await sendMessageToTab<boolean>(activeTabId, {
        type: 'LIKE_COMMENT',
        payload: { commentId: comment.commentId },
      });

      if (likeSuccess) {
        comment.likeStatus = 'DONE';
        comment.pipeline.likedAt = new Date().toISOString();
        logger.info('Comment liked successfully', {
          ...context,
          step: 'LIKE_SUCCESS',
        });
        await savePostState(postState._meta.postId, postState);
        broadcastState({ comments: postState.comments }); // Broadcast progress
      } else {
        logger.error(
          'Like action failed in content script',
          new Error('sendMessageToTab returned false'),
          { ...context, step: 'LIKE_FAILED' }
        );
        throw new Error(`Like action failed for comment ${comment.commentId}`);
      }
      return; // IMPORTANT: Return after each atomic action.
    }

    // STATE: LIKED -> REPLIED
    if (comment.replyStatus === '') {
      const stepContext = { ...context, step: 'REPLY_ATTEMPT' };
      logger.info('Attempting to reply to comment', stepContext);

      const replyText = await generateReply(comment, postState);

      if (replyText === null) {
        logger.error('AI reply generation failed', undefined, {
          ...context,
          step: 'GENERATE_REPLY_FAILED',
        });
        throw new Error('AI reply generation failed.');
      }

      if (replyText === '__SKIP__') {
        logger.info('AI requested to skip comment, skipping reply', {
          ...context,
          step: 'REPLY_SKIPPED_AI',
        });
        comment.replyStatus = 'DONE'; // Mark as done to skip
        comment.lastError = 'Skipped by AI';
        comment.pipeline.repliedAt = new Date().toISOString();
        await savePostState(postState._meta.postId, postState);
        broadcastState({ comments: postState.comments });
        return;
      }

      logger.info('Generated reply, submitting to page', {
        ...context,
        step: 'SUBMIT_REPLY',
        replyLength: replyText.length,
      });
      comment.pipeline.generatedReply = replyText;

      // Send the replyText to the domInteractor to be posted.
      if (!activeTabId) {
        throw new Error('Cannot reply to comment, active tab ID is not set.');
      }

      const replySuccess = await sendMessageToTab<boolean>(activeTabId, {
        type: 'REPLY_TO_COMMENT',
        payload: { commentId: comment.commentId, replyText },
      });

      if (replySuccess) {
        comment.replyStatus = 'DONE';
        comment.pipeline.repliedAt = new Date().toISOString();
        logger.info('Comment replied to successfully', {
          ...context,
          step: 'REPLY_SUCCESS',
        });
        await savePostState(postState._meta.postId, postState);
        broadcastState({ comments: postState.comments }); // Broadcast progress
      } else {
        logger.error(
          'Reply action failed in content script',
          new Error('sendMessageToTab returned false'),
          { ...context, step: 'REPLY_FAILED' }
        );
        throw new Error(`Reply action failed for comment ${comment.commentId}`);
      }
      return;
    }

    // STATE: REPLIED -> DM_SENT (for connected users)
    if (comment.connected && comment.dmStatus === '') {
      const stepContext = { ...context, step: 'DM_ATTEMPT' };
      // The messaging URL is based on the member ID, which is part of the profile URL.
      const profileIdMatch = comment.ownerProfileUrl.match(/\/in\/([^/]+)/);
      if (!profileIdMatch || !profileIdMatch[1]) {
        throw new Error(
          `Could not extract profile ID from URL: ${comment.ownerProfileUrl}`
        );
      }
      const profileId = profileIdMatch[1];
      const messagingUrl = `https://www.linkedin.com/messaging/thread/new/?recipient=${profileId}`;

      logger.info('Attempting to send DM', stepContext);
      const dmText = await generateDm(comment, postState);

      if (!dmText) {
        logger.error('AI DM generation failed', undefined, {
          ...context,
          step: 'GENERATE_DM_FAILED',
        });
        throw new Error('AI DM generation failed.');
      }

      logger.info('Generated DM, sending message', {
        ...context,
        step: 'SEND_DM',
        dmLength: dmText.length,
      });
      comment.pipeline.generatedDm = dmText;

      let dmTabId: number | undefined;
      try {
        const tab = await chrome.tabs.create({
          url: messagingUrl,
          active: false,
        });
        dmTabId = tab.id;
        if (!dmTabId) {
          throw new Error('Failed to create a new tab for sending DM.');
        }

        // Wait for the tab to load completely
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('DM tab loading timed out')),
            20000
          );
          const listener = (
            tabId: number,
            changeInfo: chrome.tabs.TabChangeInfo
          ) => {
            if (tabId === dmTabId && changeInfo.status === 'complete') {
              clearTimeout(timeout);
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });

        // Give the page a moment to settle after loading
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const dmSuccess = await sendMessageToTab<boolean>(dmTabId, {
          type: 'SEND_DM',
          payload: { dmText },
        });

        if (dmSuccess) {
          comment.dmStatus = 'DONE';
          comment.pipeline.dmAt = new Date().toISOString();
          logger.info('DM sent successfully', {
            ...context,
            step: 'DM_SUCCESS',
          });
          await savePostState(postState._meta.postId, postState);
          broadcastState({ comments: postState.comments });
        } else {
          logger.error(
            'Send DM action failed in content script',
            new Error('sendMessageToTab returned false'),
            { ...context, step: 'DM_FAILED' }
          );
          throw new Error(
            `Send DM action failed for comment ${comment.commentId}`
          );
        }
      } finally {
        if (dmTabId) {
          await chrome.tabs.remove(dmTabId);
        }
      }
      return;
    }
  } catch (error) {
    logger.error('Failed to process comment', error, {
      ...context,
      step: 'PROCESS_COMMENT_FAILED',
    });
    // TODO: Implement error handling (update lastError, attempts, set status to FAILED)
  }
};

const processQueue = async (): Promise<void> => {
  if (isProcessing) {
    logger.info('Processing is already in progress.');
    return;
  }
  isProcessing = true;
  logger.info('Starting processing queue.', {
    postUrn: activePostUrn,
    step: 'PROCESS_QUEUE_START',
  });

  while (pipelineStatus === 'running') {
    if (!activePostUrn) {
      logger.error('No active post URN. Stopping pipeline.');
      pipelineStatus = 'error';
      break;
    }

    const postState = getPostState(activePostUrn);
    if (!postState) {
      logger.error('State for post not found. Stopping.', undefined, {
        postUrn: activePostUrn,
      });
      pipelineStatus = 'error';
      break;
    }

    const nextComment = findNextComment(postState);

    if (!nextComment) {
      logger.info('All comments have been processed. Pipeline finished.', {
        postUrn: activePostUrn,
        step: 'PROCESS_QUEUE_COMPLETE',
      });
      pipelineStatus = 'idle';
      postState._meta.runState = 'idle';
      await savePostState(postState._meta.postId, postState);
      break; // Exit the loop
    }

    logger.info('Processing next comment', {
      postId: postState._meta.postId,
      commentId: nextComment.commentId,
      step: 'PROCESS_COMMENT_START',
    });
    await processComment(nextComment, postState);

    // TODO: Implement a configurable delay with jitter later
    await new Promise((resolve) => setTimeout(resolve, 2000)); // 2-second delay
  }

  isProcessing = false;
  logger.info('Processing loop ended.', {
    finalStatus: pipelineStatus,
    postUrn: activePostUrn,
    step: 'PROCESS_QUEUE_END',
  });
  const finalPostState = activePostUrn ? getPostState(activePostUrn) : null;
  broadcastState({
    pipelineStatus,
    comments: finalPostState?.comments,
  }); // Broadcast final status and comments
};

export const startPipeline = async (
  postUrn: string,
  tabId: number
): Promise<void> => {
  if (pipelineStatus !== 'idle') {
    logger.warn('Pipeline cannot be started', {
      currentState: pipelineStatus,
      postUrn,
    });
    return;
  }
  const postState = getPostState(postUrn);
  if (!postState) {
    logger.error('Cannot start pipeline, no state found for post', undefined, {
      postUrn,
    });
    return;
  }

  logger.info('Starting pipeline', { postUrn, tabId, step: 'PIPELINE_START' });
  pipelineStatus = 'running';
  activePostUrn = postUrn;
  activeTabId = tabId;
  postState._meta.runState = 'running';
  await savePostState(postUrn, postState);

  broadcastState({ pipelineStatus: 'running', comments: postState.comments });
  processQueue();
};

export const stopPipeline = async (): Promise<void> => {
  if (pipelineStatus !== 'running') {
    logger.warn('Pipeline is not running, cannot stop.', {
      status: pipelineStatus,
    });
    return;
  }
  if (!activePostUrn) {
    logger.error('Cannot stop pipeline, no active post.');
    pipelineStatus = 'error'; // Should not happen
    return;
  }

  logger.info('Stopping pipeline...', {
    postUrn: activePostUrn,
    step: 'PIPELINE_STOP',
  });
  pipelineStatus = 'paused';

  const postState = getPostState(activePostUrn);
  if (postState) {
    postState._meta.runState = 'paused';
    await savePostState(activePostUrn, postState);
  }
  broadcastState({ pipelineStatus: 'paused' });
};

export const resumePipeline = async (): Promise<void> => {
  if (pipelineStatus !== 'paused') {
    logger.warn('Pipeline is not paused, cannot resume.', {
      status: pipelineStatus,
    });
    return;
  }
  if (!activePostUrn) {
    logger.error('Cannot resume, no active post was paused.');
    return;
  }

  const postState = getPostState(activePostUrn);
  if (!postState) {
    logger.error('Cannot resume, no state found for post', undefined, {
      postUrn: activePostUrn,
    });
    return;
  }

  logger.info('Resuming pipeline', {
    postUrn: activePostUrn,
    step: 'PIPELINE_RESUME',
  });
  pipelineStatus = 'running';
  postState._meta.runState = 'running';
  await savePostState(activePostUrn, postState);

  broadcastState({ pipelineStatus: 'running' });
  processQueue();
};

export const getPipelineStatus = (): RunState => {
  return pipelineStatus;
};