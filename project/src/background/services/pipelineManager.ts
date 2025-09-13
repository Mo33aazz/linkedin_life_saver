import { logger } from '../logger';
import {
  RunState,
  PostState,
  Comment,
  ChatMessage,
  UIState,
  CapturedPostState,
} from '../../shared/types';
import { getPostState, savePostState, loadPostState, calculateCommentStats } from './stateManager';
import { getConfig } from './configManager';
import { OpenRouterClient } from './openRouterClient';

// Retry logic constants
const MAX_RETRIES = 3;
const INITIAL_DELAY = 2000; // Start with a 2-second delay for DOM actions

// Internal state variables
let pipelineStatus: RunState = 'idle';
let activePostUrn: string | null = null;
let activeTabId: number | null = null;
let isProcessing = false;
// A lock to prevent concurrent processing loops

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

/**
 * A generic helper to retry an asynchronous function with exponential backoff and jitter.
 */
interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  onRetry: (error: Error, attempt: number) => void;
}

async function retryAsyncFunction<T>(
  asyncFn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    try {
      return await asyncFn();
    } catch (error) {
      lastError = error as Error;
      options.onRetry(lastError, attempt + 1);

      if (attempt < options.maxRetries - 1) {
        const delay = options.initialDelay * Math.pow(2, attempt);
        const jitter = delay * 0.2 * (Math.random() - 0.5); // +/- 10% jitter
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      }
    }
  }
  throw lastError;
}

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

// Max replies limit functionality removed - now using Comments to Fetch parameter

const findNextComment = (postState: PostState): Comment | null => {
  for (const comment of postState.comments) {
    // Priority 1: A comment that needs its connection status checked.
    // This step will now also handle the DM if applicable.
    if (typeof comment.connected === 'undefined') {
      return comment;
    }
    // Priority 2: A comment that needs a like or reply, and whose DM step is complete.
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
  const context = {
    postId: postState._meta.postId,
    commentId: comment.commentId,
    step: 'GENERATE_REPLY',
  };
  
  const aiConfig = getConfig();
  
  // Check if AI is disabled, use static text
  if (aiConfig.aiEnabled === false) {
    logger.info('Using static reply text (AI disabled)', context);
    const staticText = comment.connected 
      ? aiConfig.staticTexts?.replyText 
      : aiConfig.staticTexts?.nonConnectedText;
    
    if (!staticText) {
      logger.warn('No static text configured for reply', context);
      return null;
    }
    
    return staticText;
  }
  
  // AI is enabled, proceed with AI generation
  logger.info('Generating AI reply', context);
  try {
    if (!aiConfig.apiKey) {
      logger.error('OpenRouter API key is not set.', undefined, context);
      return null;
    }

    const client = new OpenRouterClient(aiConfig.apiKey, aiConfig.attribution);

    // Use different prompts based on connection status
    const systemPrompt = comment.connected 
      ? aiConfig.reply?.customPrompt
      : aiConfig.reply?.nonConnectedPrompt;
    
    const userMessageContent = `
       Post URL: ${postState._meta.postUrl}
       My persona: ${systemPrompt}
       Original comment (from ${comment.ownerProfileUrl}):
       '${comment.text}'
       Output: ONLY the reply text. Only output '__SKIP__' if the comment contains:
       - Explicit profanity, hate speech, or personal attacks
       - Clear spam (repeated promotional links, unrelated product sales)
       - Completely off-topic content unrelated to the post
       - Bot-like repetitive text or gibberish
       Otherwise, always generate a thoughtful reply even for brief or simple comments.
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
    throw error;
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
  
  const aiConfig = getConfig();
  
  // Check if AI is disabled, use static text
  if (aiConfig.aiEnabled === false) {
    logger.info('Using static DM text (AI disabled)', context);
    const staticDmText = aiConfig.staticTexts?.dmText;
    
    if (!staticDmText) {
      logger.warn('No static DM text configured', context);
      return null;
    }
    
    return staticDmText;
  }
  
  // AI is enabled, proceed with AI generation
  logger.info('Generating AI DM', context);
  try {
    if (!aiConfig.apiKey) {
      logger.error('OpenRouter API key is not set.', undefined, context);
      return null;
    }

    const client = new OpenRouterClient(aiConfig.apiKey, aiConfig.attribution);

    const userMessageContent = `
       Their comment on my post: '${comment.text}'
       My custom instructions for this DM: ${aiConfig.dm?.customPrompt}
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
  logger.debug('Entering processComment with current statuses', {
    ...context,
    connected: typeof comment.connected === 'undefined' ? 'UNSET' : comment.connected,
    likeStatus: comment.likeStatus,
    replyStatus: comment.replyStatus,
    dmStatus: comment.dmStatus,
  });
  try {
    // STEP 1: Check connection status and send DM if connected
    if (typeof comment.connected === 'undefined') {
      const stepContext = { ...context, step: 'CONNECTION_AND_DM_CHECK' };
      logger.info('Attempting to check connection status and potentially send DM', {
        ...stepContext,
        profileUrl: comment.ownerProfileUrl,
      });
      let connectionTabId: number | undefined;
      try {
        logger.debug('Creating new active tab for profile visit...', stepContext);
        const tab = await chrome.tabs.create({
          url: comment.ownerProfileUrl,
          active: true, // Make the tab active to ensure scripts can run reliably
        });
        connectionTabId = tab.id;
        if (!connectionTabId) {
          throw new Error('Failed to create a new tab for connection check.');
        }
        logger.debug('Created tab for connection check', { ...stepContext, connectionTabId });

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('Tab loading timed out after 45 seconds.'));
          }, 45000);

          const listener = (
            tabId: number,
            changeInfo: chrome.tabs.TabChangeInfo,
            _tab: chrome.tabs.Tab
          ) => {
            if (tabId === connectionTabId && (changeInfo.status === 'complete' || (changeInfo.status === 'interactive' && !_tab.url?.startsWith('chrome://')))) {
              logger.debug('Tab reported ready state', { ...stepContext, status: changeInfo.status });
              clearTimeout(timeout);
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
        
        logger.debug('Injecting script to check connection status...', stepContext);
        const injectionResults = await chrome.scripting.executeScript({
          target: { tabId: connectionTabId },
          func: () => {
            const distanceBadge = document.querySelector('span.distance-badge .dist-value');
            return !!(distanceBadge && distanceBadge.textContent?.trim() === '1st');
          },
        });
        
        if (injectionResults && injectionResults.length > 0) {
          comment.connected = injectionResults[0].result as boolean;
          logger.info('Connection status determined successfully', { ...stepContext, connected: comment.connected });

          if (comment.connected) {
            logger.info('User is a 1st-degree connection. Attempting to send DM.', { ...stepContext });
            try {
              logger.debug('Generating DM text...', stepContext);
              const dmText = await generateDm(comment, postState);
              if (!dmText) throw new Error('AI DM generation failed.');
              comment.pipeline.generatedDm = dmText;
              logger.debug('DM text generated successfully', { ...stepContext, dmLength: dmText.length });

              const sendDmInTab = async () => {
                // Wait for page to be fully loaded before attempting to close chat windows
                logger.debug('Waiting for page to load before closing chat windows...', stepContext);
                await new Promise(resolve => {
                  const checkPageReady = () => {
                    chrome.scripting.executeScript({
                      target: { tabId: connectionTabId! },
                      func: () => document.readyState === 'complete' && document.body && document.querySelector('main')
                    }).then(results => {
                      if (results && results[0]?.result) {
                        resolve(void 0);
                      } else {
                        setTimeout(checkPageReady, 500);
                      }
                    }).catch(() => setTimeout(checkPageReady, 500));
                  };
                  checkPageReady();
                });
                
                logger.debug('Injecting script to close any open chat windows...', stepContext);
                const preCloseResults = await chrome.scripting.executeScript({
                    target: { tabId: connectionTabId! },
                    func: () => {
                        // Wait for elements to be fully rendered
                        const waitForElements = () => {
                            return new Promise<void>((resolve) => {
                                const checkElements = () => {
                                    const buttons = document.querySelectorAll('button');
                                    if (buttons.length > 0) {
                                        resolve();
                                    } else {
                                        setTimeout(checkElements, 100);
                                    }
                                };
                                checkElements();
                            });
                        };
                        
                        return waitForElements().then(() => {
                             // Multiple selector strategies for close buttons
                             // Target specific conversation close buttons with multiple criteria
                             let closeButtons: NodeListOf<Element> | Element[] = document.querySelectorAll('button.msg-overlay-bubble-header__control.artdeco-button--circle');
                             closeButtons = Array.from(closeButtons).filter(btn => {
                                 const textContent = btn.textContent || (btn as HTMLElement).innerText || '';
                                 const hasCloseIcon = btn.querySelector('svg[data-test-icon="close-small"]') !== null;
                                 const hasConversationText = textContent.includes('Close your conversation with');
                                 
                                 // Only click if it has both the close icon and conversation text
                                 return hasCloseIcon && hasConversationText;
                             });
                            
                            let closedCount = 0;
                            closeButtons.forEach(btn => {
                                try {
                                    // Ensure button is visible and clickable
                                    const element = btn as HTMLElement;
                                    if (element.offsetParent !== null && !element.hasAttribute('disabled')) {
                                        element.click();
                                        closedCount++;
                                    }
                                } catch (e) {
                                    console.warn('Failed to click close button:', e);
                                }
                            });
                            
                            return { closedCount };
                        });
                    },
                });
                logger.debug(`Closed ${preCloseResults[0]?.result?.closedCount || 0} pre-existing chat windows.`, stepContext);
                await new Promise(r => setTimeout(r, 500));
                
                logger.debug('Injecting script to click "Message" button...', stepContext);
                const clickResults = await chrome.scripting.executeScript({
                  target: { tabId: connectionTabId! },
                  func: () => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const messageButton = buttons.find(btn => {
                      const text = (btn.textContent || btn.innerText || '').trim();
                      const ariaLabel = btn.getAttribute('aria-label') || '';
                      return text === 'Message' || /^Message[ ]+[a-zA-Z]+/i.test(ariaLabel);
                    });
                    if (messageButton) {
                      (messageButton as HTMLElement).click();
                      return { success: true };
                    }
                    return { success: false, error: 'Message button not found' };
                  },
                });
                if (!clickResults || !clickResults[0]?.result?.success) throw new Error(`Failed to click Message button: ${clickResults[0]?.result?.error || 'Unknown error'}`);
                logger.debug('"Message" button clicked. Waiting for chat popup...', stepContext);
                await new Promise(r => setTimeout(r, 2000));

                logger.debug('Injecting script to fill DM textbox...', stepContext);
                const fillResults = await chrome.scripting.executeScript({
                  target: { tabId: connectionTabId! },
                  args: [dmText],
                  func: (textToFill: string) => {
                    const textbox = document.querySelector('div[role="textbox"][aria-label*="Write a message"]');
                    if (textbox) {
                      textbox.innerHTML = `<p>${textToFill}</p>`;
                      textbox.dispatchEvent(new Event('input', { bubbles: true }));
                      return { success: true };
                    }
                    return { success: false, error: 'Message textbox not found' };
                  },
                });
                if (!fillResults || !fillResults[0]?.result?.success) throw new Error(`Failed to fill DM textbox: ${fillResults[0]?.result?.error || 'Unknown error'}`);
                logger.debug('DM textbox filled. Waiting before sending...', stepContext);
                await new Promise(r => setTimeout(r, 500));

                logger.debug('Injecting script to click "Send" button...', stepContext);
                const sendResults = await chrome.scripting.executeScript<any[], { success: boolean; error?: string; availableButtons?: unknown[] }>({
                  target: { tabId: connectionTabId! },
                  func: () => {
                    const sendButton = 
                      Array.from(document.querySelectorAll('button')).find(btn => (btn.textContent || btn.innerText || '').trim() === 'Send') ||
                      Array.from(document.querySelectorAll('button')).find(btn => (btn.getAttribute('aria-label') || '').toLowerCase().includes('send')) ||
                      document.querySelector('button[data-control-name*="send"]') ||
                      Array.from(document.querySelectorAll('button')).find(btn => btn.className.toLowerCase().includes('send'));
                    
                    if (sendButton) {
                      if ((sendButton as HTMLElement).offsetParent === null) return { success: false, error: 'Send button is not visible' };
                      if ((sendButton as HTMLButtonElement).disabled) return { success: false, error: 'Send button is disabled' };
                      (sendButton as HTMLElement).click();
                      return { success: true };
                    }
                    
                    const allButtons = Array.from(document.querySelectorAll('button')).map(btn => ({
                      text: (btn.textContent || btn.innerText || '').trim(),
                      ariaLabel: btn.getAttribute('aria-label'),
                      className: btn.className,
                      disabled: (btn as HTMLButtonElement).disabled,
                      visible: (btn as HTMLElement).offsetParent !== null
                    }));
                    return { success: false, error: 'Send button not found', availableButtons: allButtons.slice(0, 10) };
                  },
                });

                const sendResult = sendResults?.[0]?.result as { success: boolean; error?: string; availableButtons?: unknown[] } | undefined;
                if (!sendResult || !sendResult.success) {
                    logger.error('Send button script failed.', { ...stepContext, result: sendResult });
                    throw new Error(`Failed to click Send button: ${sendResult?.error || 'Unknown error'}`);
                }

                await new Promise(r => setTimeout(r, 1000));
                
                // Wait for page to be ready before closing chat windows after sending
                logger.debug('Waiting for page to be ready before closing chat windows after sending...', stepContext);
                await new Promise(resolve => {
                  const checkPageReady = () => {
                    chrome.scripting.executeScript({
                      target: { tabId: connectionTabId! },
                      func: () => document.readyState === 'complete' && document.body
                    }).then(results => {
                      if (results && results[0]?.result) {
                        resolve(void 0);
                      } else {
                        setTimeout(checkPageReady, 300);
                      }
                    }).catch(() => setTimeout(checkPageReady, 300));
                  };
                  checkPageReady();
                });
                
                logger.debug('Injecting script to close chat window after sending...', stepContext);
                const postCloseResults = await chrome.scripting.executeScript({
                    target: { tabId: connectionTabId! },
                    func: () => {
                        // Wait for elements to be fully rendered after sending
                        const waitForElements = () => {
                            return new Promise<void>((resolve) => {
                                const checkElements = () => {
                                    const buttons = document.querySelectorAll('button');
                                    if (buttons.length > 0) {
                                        resolve();
                                    } else {
                                        setTimeout(checkElements, 100);
                                    }
                                };
                                checkElements();
                            });
                        };
                        
                        return waitForElements().then(() => {
                            // Target specific conversation close buttons with multiple criteria
                             let closeButtons: NodeListOf<Element> | Element[] = document.querySelectorAll('button.msg-overlay-bubble-header__control.artdeco-button--circle');
                             closeButtons = Array.from(closeButtons).filter(btn => {
                                 const textContent = btn.textContent || (btn as HTMLElement).innerText || '';
                                 const hasCloseIcon = btn.querySelector('svg[data-test-icon="close-small"]') !== null;
                                 const hasConversationText = textContent.includes('Close your conversation with');
                                 
                                 // Only click if it has both the close icon and conversation text
                                 return hasCloseIcon && hasConversationText;
                             });
                            
                            let closedCount = 0;
                            closeButtons.forEach(btn => {
                                try {
                                    // Ensure button is visible and clickable
                                    const element = btn as HTMLElement;
                                    if (element.offsetParent !== null && !element.hasAttribute('disabled')) {
                                        element.click();
                                        closedCount++;
                                    }
                                } catch (e) {
                                    console.warn('Failed to click close button:', e);
                                }
                            });
                            
                            return { closedCount };
                        });
                    },
                });
                logger.debug(`Closed ${postCloseResults[0]?.result?.closedCount || 0} chat windows post-send.`, stepContext);
              };

              await retryAsyncFunction(sendDmInTab, {
                maxRetries: MAX_RETRIES,
                initialDelay: INITIAL_DELAY,
                onRetry: (error, attempt) => logger.warn(`Send DM sequence attempt ${attempt}/${MAX_RETRIES} failed`, { ...stepContext, error: error.message }),
              });

              comment.dmStatus = 'DONE';
              comment.pipeline.dmAt = new Date().toISOString();
              logger.info('DM sent successfully from profile page', { ...stepContext });
            } catch (dmError) {
              logger.error('Failed to send DM from profile page', dmError, { ...stepContext });
              comment.dmStatus = 'FAILED';
              comment.lastError = (dmError as Error).message;
            }
          } else {
            logger.info('User is not a 1st-degree connection. Skipping DM.', { ...stepContext });
            comment.dmStatus = 'DONE';
            comment.lastError = 'DM skipped: Not a 1st-degree connection.';
          }
        } else {
          throw new Error('Script injection failed for connection check.');
        }
      } catch (error) {
        logger.error('Failed during connection check/DM step', error, { ...stepContext });
        comment.connected = false;
        comment.dmStatus = 'FAILED';
        comment.lastError = (error as Error).message;
      } finally {
        if (connectionTabId) {
          logger.debug('Closing profile tab.', { ...stepContext, tabId: connectionTabId });
          await chrome.tabs.remove(connectionTabId);
        }
        // Switch focus back to the original tab for a better user experience
        if (activeTabId) {
          try {
            await chrome.tabs.update(activeTabId, { active: true });
            logger.debug('Focus returned to original pipeline tab.', { tabId: activeTabId });
          } catch (e) {
            logger.warn('Failed to return focus to original tab, it may have been closed.', { tabId: activeTabId, error: (e as Error).message });
          }
        }
      }

      await savePostState(activePostUrn!, postState);
      broadcastState({ pipelineStatus, postUrn: activePostUrn ?? undefined, comments: postState.comments });
    }

    // STATE: QUEUED -> LIKED
    if (comment.likeStatus === '') {
      const stepContext = { ...context, step: 'LIKE_ATTEMPT' };
      logger.info('Attempting to like comment', stepContext);
      if (!activeTabId) throw new Error('Cannot like comment, active tab ID is not set.');
      comment.attempts.like = 0;

      try {
        await retryAsyncFunction(
          async () => {
            comment.attempts.like++;
            const likeSuccess = await sendMessageToTab<boolean>(activeTabId!, {
              type: 'LIKE_COMMENT',
              payload: { commentId: comment.commentId },
            });
            if (!likeSuccess) throw new Error(`Content script failed to like comment ${comment.commentId}`);
          },
          {
            maxRetries: MAX_RETRIES,
            initialDelay: INITIAL_DELAY,
            onRetry: (error, attempt) => logger.warn(`Like attempt ${attempt}/${MAX_RETRIES} failed`, { ...stepContext, error: error.message }),
          }
        );
        comment.likeStatus = 'DONE';
        comment.pipeline.likedAt = new Date().toISOString();
        logger.info('Comment liked successfully', { ...context, step: 'LIKE_SUCCESS' });
      } catch (error) {
        logger.error('Failed to like comment after all retries', error, { ...context, step: 'LIKE_FAILED_FINAL' });
        comment.likeStatus = 'FAILED';
        comment.lastError = (error as Error).message;
      }
      await savePostState(activePostUrn!, postState);
      broadcastState({ pipelineStatus, comments: postState.comments });
    }

    // STATE: LIKED -> REPLIED
    if (comment.replyStatus === '') {
      const stepContext = { ...context, step: 'REPLY_ATTEMPT' };
      logger.info('Attempting to reply to comment', stepContext);
      comment.attempts.reply = 0;

      try {
        const aiConfig = getConfig();
        let replyText: string | null;

        if (comment.connected === false) {
          replyText = aiConfig.reply?.nonConnectedPrompt || "Thanks for your comment! I'd love to connect first.";
          logger.info('Using non-connected reply template', { ...stepContext });
        } else {
          replyText = await generateReply(comment, postState);
        }

        if (replyText === null) throw new Error('AI reply generation failed.');

        if (replyText === '__SKIP__') {
          logger.info('AI requested to skip comment, skipping reply', { ...context });
          comment.replyStatus = 'DONE';
          comment.lastError = 'Skipped by AI';
        } else {
          comment.pipeline.generatedReply = replyText;
          if (!activeTabId) throw new Error('Cannot reply, active tab ID is not set.');

          await retryAsyncFunction(
            async () => {
              comment.attempts.reply++;
              const replySuccess = await sendMessageToTab<boolean>(activeTabId!, {
                type: 'REPLY_TO_COMMENT',
                payload: { commentId: comment.commentId, replyText },
              });
              if (!replySuccess) throw new Error(`Content script failed to reply to comment ${comment.commentId}`);
            },
            {
              maxRetries: MAX_RETRIES,
              initialDelay: INITIAL_DELAY,
              onRetry: (error, attempt) => logger.warn(`Reply attempt ${attempt}/${MAX_RETRIES} failed`, { ...stepContext, error: error.message }),
            }
          );
          comment.replyStatus = 'DONE';
          logger.info('Comment replied to successfully', { ...context });
        }
        comment.pipeline.repliedAt = new Date().toISOString();
        const updatedStats = calculateCommentStats((postState.comments || []).map(c => ({ type: c.type, threadId: c.threadId, ownerProfileUrl: c.ownerProfileUrl })), postState._meta.userProfileUrl || '');
        broadcastState({ stats: updatedStats });
      } catch (error) {
        logger.error('Failed to reply to comment', error, { ...context, step: 'REPLY_FAILED_FINAL' });
        comment.replyStatus = 'FAILED';
        comment.lastError = (error as Error).message;
      }
      await savePostState(activePostUrn!, postState);
      broadcastState({ pipelineStatus, comments: postState.comments });
    }
  } catch (error) {
    logger.error('An unexpected error occurred while processing comment', error, context);
    if (comment.likeStatus === '') comment.likeStatus = 'FAILED';
    else if (comment.replyStatus === '') comment.replyStatus = 'FAILED';
    comment.lastError = `Unexpected error: ${(error as Error).message}`;
    await savePostState(activePostUrn!, postState);
    broadcastState({ pipelineStatus, comments: postState.comments });
  }
};

const processQueue = async (): Promise<void> => {
  if (isProcessing) return;
  isProcessing = true;
  logger.info('Starting processing queue.', { postUrn: activePostUrn });

  while (pipelineStatus === 'running') {
    if (!activePostUrn) {
      pipelineStatus = 'error';
      break;
    }

    const postState = getPostState(activePostUrn);
    if (!postState) {
      pipelineStatus = 'error';
      break;
    }

    const completedReplies = postState.comments.filter(c => c.replyStatus === 'DONE').length;
    const totalComments = postState.comments.length;
    
    // Stop when all available comments have been processed
    if (completedReplies >= totalComments) {
      logger.info('All available comments have been processed. Stopping pipeline.', { completedReplies, totalComments });
      pipelineStatus = 'idle';
      break;
    }

    const nextComment = findNextComment(postState);

    if (!nextComment) {
      logger.info('All comments have been processed.', { postUrn: activePostUrn });
      pipelineStatus = 'idle';
      break;
    }

    await processComment(nextComment, postState);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  isProcessing = false;
  logger.info('Processing loop ended.', { finalStatus: pipelineStatus });
  if (activePostUrn) {
    const finalPostState = getPostState(activePostUrn);
    if(finalPostState) finalPostState._meta.runState = pipelineStatus;
    broadcastState({ pipelineStatus, comments: finalPostState?.comments });
  }
};

export const startPipeline = async (
  postUrn: string,
  tabId: number,
  maxComments?: number
): Promise<void> => {
  if (pipelineStatus !== 'idle') {
    logger.warn('Pipeline cannot be started', { currentState: pipelineStatus, postUrn });
    return;
  }
  
  let postState = await loadPostState(postUrn);
  
  if (!postState) {
    try {
      const response = await sendMessageToTab<CapturedPostState>(tabId, {
        type: 'CAPTURE_POST_STATE',
        payload: { maxComments },
      });
      if (response && response.postUrn) {
        const normalizedComments: Comment[] = (response.comments || []).map(c => ({
          ...c,
          connected: undefined,
          likeStatus: '',
          replyStatus: c.hasUserReply ? 'DONE' : '',
          dmStatus: '',
          attempts: { like: 0, reply: 0, dm: 0 },
          lastError: c.hasUserReply ? 'Already replied by user' : '',
          pipeline: { queuedAt: new Date().toISOString(), likedAt: '', repliedAt: c.hasUserReply ? new Date().toISOString() : '', dmAt: '' },
        }));

        const newPostState: PostState = {
          _meta: {
            postId: postUrn,
            postUrl: `https://www.linkedin.com/feed/update/${postUrn}`,
            runState: 'idle',
            lastUpdated: new Date().toISOString(),
            userProfileUrl: response.userProfileUrl || '',
          },
          comments: normalizedComments,
        };
        await savePostState(postUrn, newPostState);
        postState = newPostState;
        const stats = calculateCommentStats((postState.comments || []).map(c => ({ type: c.type, threadId: c.threadId, ownerProfileUrl: c.ownerProfileUrl })), postState._meta.userProfileUrl || '');
        broadcastState({ stats });
      }
    } catch (error) {
      logger.error('Failed to capture initial post state', error, { postUrn });
      return;
    }
  }

  if (!postState) {
    logger.error('Cannot start pipeline, failed to obtain post state.', { postUrn });
    return;
  }
  
  pipelineStatus = 'running';
  activePostUrn = postUrn;
  activeTabId = tabId;
  postState._meta.runState = 'running';
  await savePostState(postUrn, postState);

  broadcastState({ pipelineStatus: 'running', comments: postState.comments, postUrn: activePostUrn });
  processQueue();
};

export const stopPipeline = async (): Promise<void> => {
  if (pipelineStatus !== 'running') return;
  if (!activePostUrn) {
    pipelineStatus = 'error';
    return;
  }

  logger.info('Stopping pipeline...', { postUrn: activePostUrn });
  pipelineStatus = 'paused';

  const postState = getPostState(activePostUrn);
  if (postState) {
    postState._meta.runState = 'paused';
    await savePostState(activePostUrn, postState);
  }
  broadcastState({ pipelineStatus: 'paused' });
};

export const resumePipeline = async (postUrn?: string, tabId?: number): Promise<void> => {
  if (pipelineStatus === 'running') return;
  
  const targetUrn = postUrn || activePostUrn;
  if (!targetUrn) {
    logger.error('Cannot resume: no post URN provided or active.');
    return;
  }

  const postState = await loadPostState(targetUrn);
  if (!postState) {
    logger.error('Cannot resume: no saved state found for post', undefined, { postUrn: targetUrn });
    return;
  }

  activePostUrn = targetUrn;
  if (tabId) activeTabId = tabId;
  pipelineStatus = 'running';
  postState._meta.runState = 'running';
  await savePostState(activePostUrn, postState);

  broadcastState({ pipelineStatus: 'running', postUrn: activePostUrn, comments: postState.comments });
  processQueue();
};

export const resetPipeline = async (postUrn?: string): Promise<void> => {
  if (!postUrn || postUrn === activePostUrn) {
    pipelineStatus = 'idle';
    activePostUrn = null;
    activeTabId = null;
    isProcessing = false;
  }
  broadcastState({ pipelineStatus: 'idle', postUrn: postUrn ?? undefined });
};

export const getPipelineStatus = (): RunState => {
  return pipelineStatus;
};

export const getActiveTabId = (): number | null => {
  return activeTabId;
};