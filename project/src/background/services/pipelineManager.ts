// src/background/services/pipelineManager.ts

import {
  RunState,
  PostState,
  Comment,
  ChatMessage,
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
let broadcastUpdate: () => void = () => {
  console.warn('broadcastUpdate not initialized in PipelineManager');
};

// This will be set by the main service worker script to send messages to content scripts
let sendMessageToTab: <T>(
  tabId: number,
  message: { type: string; payload?: unknown }
) => Promise<T> = async () => {
  console.warn('sendMessageToTab not initialized in PipelineManager');
  return Promise.reject('sendMessageToTab not initialized');
};

export const initPipelineManager = (
  broadcaster: () => void,
  messageSender: <T>(
    tabId: number,
    message: { type: string; payload?: unknown }
  ) => Promise<T>
) => {
  broadcastUpdate = broadcaster;
  sendMessageToTab = messageSender;
};

const findNextComment = (postState: PostState): Comment | null => {
  for (const comment of postState.comments) {
    // A comment needs processing if its like or reply status is not 'DONE' or 'FAILED'
    if (comment.likeStatus === '' || comment.replyStatus === '') {
      return comment;
    }
  }
  return null; // No more comments to process
};

const generateReply = async (
  comment: Comment,
  postState: PostState
): Promise<string | null> => {
  try {
    const aiConfig = getConfig();
    if (!aiConfig.apiKey) {
      console.error('OpenRouter API key is not set.');
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
      messages: messages,
      temperature: aiConfig.temperature,
      top_p: aiConfig.top_p,
      max_tokens: aiConfig.max_tokens,
    });

    return replyText;
  } catch (error) {
    console.error('Failed to generate AI reply:', error);
    return null;
  }
};

const processComment = async (
  comment: Comment,
  postState: PostState
): Promise<void> => {
  try {
    // STATE: QUEUED -> LIKED
    if (comment.likeStatus === '') {
      console.log(`Liking comment: ${comment.commentId}`);
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
        await savePostState(postState._meta.postId, postState);
        broadcastUpdate(); // Broadcast progress (state of comments changed)
      } else {
        throw new Error(`Like action failed for comment ${comment.commentId}`);
      }
      return; // IMPORTANT: Return after each atomic action.
    }

    // STATE: LIKED -> REPLIED
    if (comment.replyStatus === '') {
      console.log(`Generating reply for comment: ${comment.commentId}`);

      const replyText = await generateReply(comment, postState);

      if (replyText === null) {
        throw new Error('AI reply generation failed.');
      }

      if (replyText === '__SKIP__') {
        console.log(`AI requested to skip comment ${comment.commentId}.`);
        comment.replyStatus = 'DONE'; // Mark as done to skip
        comment.lastError = 'Skipped by AI';
        comment.pipeline.repliedAt = new Date().toISOString();
        await savePostState(postState._meta.postId, postState);
        broadcastUpdate();
        return;
      }

      console.log(`Generated reply for ${comment.commentId}: '${replyText}'`);
      comment.pipeline.generatedReply = replyText;

      // TODO (I6.T4): Send the replyText to the domInteractor to be posted.
      // For now, we'll simulate success as per the task scope.
      comment.replyStatus = 'DONE';
      comment.pipeline.repliedAt = new Date().toISOString();
      await savePostState(postState._meta.postId, postState);
      broadcastUpdate(); // Broadcast progress
      return;
    }
  } catch (error) {
    console.error(`Failed to process comment ${comment.commentId}:`, error);
    // TODO: Implement error handling (update lastError, attempts, set status to FAILED)
  }
};

const processQueue = async (): Promise<void> => {
  if (isProcessing) {
    console.log('Processing is already in progress.');
    return;
  }
  isProcessing = true;

  while (pipelineStatus === 'running') {
    if (!activePostUrn) {
      console.error('No active post URN. Stopping pipeline.');
      pipelineStatus = 'error';
      break;
    }

    const postState = getPostState(activePostUrn);
    if (!postState) {
      console.error(`State for post ${activePostUrn} not found. Stopping.`);
      pipelineStatus = 'error';
      break;
    }

    const nextComment = findNextComment(postState);

    if (!nextComment) {
      console.log('All comments have been processed. Pipeline finished.');
      pipelineStatus = 'idle';
      postState._meta.runState = 'idle';
      await savePostState(postState._meta.postId, postState);
      break; // Exit the loop
    }

    await processComment(nextComment, postState);

    // TODO: Implement a configurable delay with jitter later
    await new Promise((resolve) => setTimeout(resolve, 2000)); // 2-second delay
  }

  isProcessing = false;
  console.log(`Processing loop ended. Final status: ${pipelineStatus}`);
  broadcastUpdate(); // Broadcast final status
};

export const startPipeline = async (
  postUrn: string,
  tabId: number
): Promise<void> => {
  if (pipelineStatus !== 'idle') {
    console.warn(`Pipeline cannot be started from state: ${pipelineStatus}`);
    return;
  }
  const postState = getPostState(postUrn);
  if (!postState) {
    console.error(`Cannot start pipeline, no state found for post ${postUrn}`);
    return;
  }

  console.log(`Starting pipeline for post: ${postUrn} on tab ${tabId}`);
  pipelineStatus = 'running';
  activePostUrn = postUrn;
  activeTabId = tabId;
  postState._meta.runState = 'running';
  await savePostState(postUrn, postState);

  processQueue();
};

export const stopPipeline = async (): Promise<void> => {
  if (pipelineStatus !== 'running') {
    console.warn('Pipeline is not running.');
    return;
  }
  if (!activePostUrn) {
    console.error('Cannot stop pipeline, no active post.');
    pipelineStatus = 'error'; // Should not happen
    return;
  }

  console.log('Stopping pipeline...');
  pipelineStatus = 'paused';

  const postState = getPostState(activePostUrn);
  if (postState) {
    postState._meta.runState = 'paused';
    await savePostState(activePostUrn, postState);
  }
};

export const resumePipeline = async (): Promise<void> => {
  if (pipelineStatus !== 'paused') {
    console.warn('Pipeline is not paused.');
    return;
  }
  if (!activePostUrn) {
    console.error('Cannot resume, no active post was paused.');
    return;
  }

  const postState = getPostState(activePostUrn);
  if (!postState) {
    console.error(`Cannot resume, no state found for post ${activePostUrn}`);
    return;
  }

  console.log(`Resuming pipeline for post: ${activePostUrn}`);
  pipelineStatus = 'running';
  postState._meta.runState = 'running';
  await savePostState(activePostUrn, postState);

  processQueue();
};

export const getPipelineStatus = (): RunState => {
  return pipelineStatus;
};