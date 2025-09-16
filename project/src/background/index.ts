/// <reference lib="dom" />
// This is the service worker script.
// It will house the core orchestration logic, state management, and API calls.
import {
  calculateCommentStats,
  savePostState,
  loadAllStates,
  getPostState,
  mergeCapturedState,
  loadPostState,
  clearPostState,
} from './services/stateManager';
import {
  initPipelineManager,
  startPipeline,
  stopPipeline,
  resumePipeline,
  resetPipeline,
  getPipelineStatus,
  getActiveTabId,
} from './services/pipelineManager';
import {
  initializeConfig,
  updateConfig,
  getConfig,
} from './services/configManager';
import {
  Post,
  PostState,
  UIState,
  AIConfig,
  OpenRouterModel,
  LogEntry,
  ParsedComment,
  Comment,
} from '../shared/types';
import { OpenRouterClient } from './services/openRouterClient';
import { logger } from './logger';

// Define the broadcaster function
const broadcastLog = (logEntry: LogEntry) => {
  // Fire-and-forget broadcast for logs.
  (async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!tab || !tab.id) {
      logger.warn('No active tab found to send state update.');
      return;
    }
    chrome.tabs
      .sendMessage(tab.id, { type: 'LOG_ENTRY', payload: logEntry })
      .catch((error) => {
        if (error.message.includes('Receiving end does not exist')) {
          // Expected error when no UI is listening. Safe to ignore.
        } else {
          // Use console.warn directly to avoid recursive logging loop if logger is broken.
          console.warn(
            'An unexpected error occurred during log broadcast',
            error
          );
        }
      });
  })();
};

// Initialize the logger
logger.initialize(broadcastLog);
// Reduce verbosity in production to minimize UI updates and overhead
logger.setSettings({ minLevel: 'INFO' });

logger.info('LinkedIn Engagement Assistant Service Worker loaded.');

// Initialize the configuration on startup. This returns a promise that resolves
// when the configuration is loaded. We await this promise in message handlers
// that depend on the config.
const configInitializationPromise = initializeConfig();

/**
 * Broadcasts the latest state to all UI components.
 * @param state The partial state to broadcast.
 */
const broadcastStateUpdate = (state: Partial<UIState>) => {
  logger.debug('Broadcasting state update', { state });
  // This is a fire-and-forget broadcast. The promise it returns may be
  // rejected if no UI component is open to receive it. We can safely
  // ignore this rejection as it's an expected condition.
  (async () => {
    try {
      const tabs = await chrome.tabs.query({
        url: ['https://www.linkedin.com/*'],
      });

      if (!tabs.length) {
        logger.warn('No LinkedIn tabs found to send state update.');
        return;
      }

      await Promise.all(
        tabs
          .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
          .map((tab) =>
            chrome.tabs
              .sendMessage(tab.id, {
                type: 'STATE_UPDATE',
                payload: state,
              })
              .catch((error) => {
                const message = (error as Error).message || '';
                if (message.includes('Receiving end does not exist')) {
                  return;
                }
                logger.warn('An unexpected error occurred during state broadcast', {
                  tabId: tab.id,
                  error: message || String(error),
                });
              })
          )
      );
    } catch (error) {
      logger.error('Failed to broadcast state update to tabs', error);
    }
    // do something with response here, not outside the function
  })();

  // chrome.runtime.sendMessage({
  //   type: 'STATE_UPDATE',
  //   payload: state,
  // })
};

const sendMessageToTab = <T>(
  tabId: number,
  message: { type: string; payload?: unknown }
): Promise<T> => {
  logger.debug('Sending message to tab', { tabId, messageType: message.type });
  return new Promise<T>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        const error = new Error(chrome.runtime.lastError.message);
        logger.error('Error sending message to tab', error, { tabId, message });
        return reject(error);
      }
      if (response && response.status === 'success') {
        logger.debug('Received success response from tab message', {
          tabId,
          messageType: message.type,
        });
        resolve(response.payload as T);
      } else {
        const errorMsg =
          response?.message ||
          'Content script action failed or did not respond.';
        logger.warn('Content script action failed', {
          tabId,
          message,
          response,
        });
        reject(new Error(errorMsg));
      }
    });
  });
};

// Load all persisted states into memory on startup
loadAllStates()
  .then(() => {
    // broadcastStateUpdate can be called here if needed to inform UI of loaded states
    logger.info('All post states loaded into memory.');
  })
  .catch((error) => {
    logger.error('Failed to load post states on startup', error);
  });
// Initialize the pipeline manager with a broadcaster function.
initPipelineManager(broadcastStateUpdate, sendMessageToTab);

// Add tab close event listener to auto-stop pipeline when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  const currentStatus = getPipelineStatus();
  const activeTab = getActiveTabId();

  if (tabId === activeTab && currentStatus === 'running') {
    logger.info('Active pipeline tab was closed, auto-stopping pipeline', {
      tabId,
    });
    stopPipeline().catch((error) => {
      logger.error('Failed to auto-stop pipeline after tab closure', error, {
        tabId,
      });
    });
  }
});

// Auto-reset pipeline to idle when the active tab reloads or navigates
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  try {
    const activeTab = getActiveTabId();
    const status = getPipelineStatus();
    if (
      tabId === activeTab &&
      status === 'running' &&
      (changeInfo.status === 'loading' || typeof changeInfo.url === 'string')
    ) {
      logger.info(
        'Active pipeline tab reloaded/navigated. Auto-resetting pipeline to idle.',
        {
          tabId,
          changeInfo,
        }
      );
      // Use reset to move to idle state and clear active references
      resetPipeline().catch((error) => {
        logger.error('Failed to auto-reset pipeline on tab update', error, {
          tabId,
        });
      });
    }
  } catch (error) {
    logger.error(
      'tabs.onUpdated handler encountered an error',
      error as Error,
      { tabId, changeInfo }
    );
  }
});

// A curated list of popular and recommended models to show at the top.
const CURATED_MODELS = [
  'anthropic/claude-3.5-sonnet',
  'google/gemini-pro-1.5',
  'mistralai/mistral-large',
  'openai/gpt-4o',
];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_LOG_SETTINGS') {
    logger.debug('UI requested log settings');
    sendResponse({ status: 'success', payload: logger.getSettings() });
    return true;
  }

  if (message.type === 'UPDATE_LOG_SETTINGS') {
    try {
      logger.setSettings(message.payload || {});
      sendResponse({ status: 'success' });
    } catch (error) {
      logger.error('Failed to update log settings', error);
      sendResponse({ status: 'error', message: (error as Error).message });
    }
    return true;
  }

  if (message.type === 'EXPORT_LOGS') {
    logger.debug('Received EXPORT_LOGS request');
    const logs = logger.getBufferedLogs();
    // Expose for E2E verification without relying on downloads
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).__E2E_LAST_EXPORTED_LOGS = logs;
    sendResponse({ status: 'success', logs });
    return true;
  }

  if (message.type === 'EXPORT_JSON') {
    logger.debug('Received EXPORT_JSON request');
    // Get the current post URN from the sender tab URL
    const postUrnRegex = /(urn:li:activity:\d+)/;
    const match = sender.tab?.url?.match(postUrnRegex);
    const postUrn = match ? match[1] : null;
    const state = postUrn ? getPostState(postUrn) : null;
    // Expose for E2E verification without relying on downloads
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).__E2E_LAST_EXPORTED_STATE = state;
    sendResponse({ status: 'success', data: state });
    return true;
  }

  if (message.type === 'ping') {
    logger.info('Received ping from UI, sending pong back.');
    sendResponse({ payload: 'pong' });

    // Proactively send state to the UI that just connected.
    (async () => {
      const postUrnRegex = /(urn:li:activity:\d+)/;
      const match = sender.tab?.url?.match(postUrnRegex);
      if (match && match[1]) {
        const postUrn = match[1];
        // Attempt to load from storage if not in memory, to handle SW startup race conditions
        let state = getPostState(postUrn);
        if (!state) {
          state = await loadPostState(postUrn);
        }

        if (state) {
          logger.info(
            'Found existing state for this post, broadcasting to UI.',
            {
              postUrn,
            }
          );
          broadcastStateUpdate({
            comments: state.comments,
            pipelineStatus: state._meta.runState,
            postUrn: state._meta.postId,
            isInitializing: false,
          });
        } else {
          // If no state, tell UI it's not initializing anymore for this post
          broadcastStateUpdate({
            isInitializing: false,
            comments: [],
            postUrn,
          });
        }
      } else {
        // On a page with no post URN
        broadcastStateUpdate({
          isInitializing: false,
          comments: [],
          postUrn: undefined,
        });
      }
    })();

    return true;
  }

  if (message.type === 'COMMENTS_PARSED') {
    logger.info('Received COMMENTS_PARSED message', {
      commentCount: message.payload?.comments?.length,
      postUrn: message.payload?.postUrn,
    });
    // Assuming a richer payload that includes post metadata
    const { comments, userProfileUrl, postUrn, postUrl } = message.payload;
    if (!comments || !userProfileUrl || !postUrn || !postUrl) {
      logger.error('Invalid payload received for COMMENTS_PARSED', undefined, {
        payload: message.payload,
      });
      sendResponse({ status: 'error', message: 'Invalid payload' });
      return true;
    }

    const stats = calculateCommentStats(comments, userProfileUrl);

    // Log the results to meet acceptance criteria
    logger.info('Calculated Comment Stats', { stats });

    // Create and save the full post state (normalize comments into pipeline-aware objects)
    const postMeta: Post = {
      postId: postUrn,
      postUrl,
      lastUpdated: new Date().toISOString(),
      runState: 'idle',
    };

    const normalizedComments: Comment[] = (comments as ParsedComment[]).map(
      (c): Comment => ({
        ...c,
        connected: undefined,
        likeStatus: '',
        replyStatus: '',
        dmStatus: '',
        attempts: { like: 0, reply: 0, dm: 0 },
        lastError: '',
        pipeline: {
          queuedAt: new Date().toISOString(),
          likedAt: '',
          repliedAt: '',
          dmAt: '',
        },
      })
    );

    const postState: PostState = {
      _meta: postMeta,
      comments: normalizedComments,
    };

    // Asynchronously save state. No need to await for the response to the content script.
    savePostState(postUrn, postState);

    // NEW: Broadcast the updated stats to the UI
    broadcastStateUpdate({ stats });

    sendResponse({ status: 'success', stats });
    return true; // Keep the message channel open for async response
  }

  if (message.type === 'REQUEST_POST_STATE_FOR_EXPORT') {
    logger.info('Received request for post state export.');
    const postUrnRegex = /(urn:li:activity:\d+)/;
    const match = sender.tab?.url?.match(postUrnRegex);

    if (match && match[1]) {
      const postUrn = match[1];
      const state = getPostState(postUrn);
      if (state) {
        sendResponse({ status: 'success', payload: state });
      } else {
        sendResponse({
          status: 'error',
          message: `No state found for post ${postUrn}`,
        });
      }
    } else {
      sendResponse({
        status: 'error',
        message: 'Could not determine post URN from URL.',
      });
    }

    return true; // Important for async response
  }

  if (message.type === 'EXPORT_JSON') {
    logger.info('Received EXPORT_JSON request');
    (async () => {
      try {
        const explicitUrn = (message.postUrn as string) || undefined;
        let postUrn = explicitUrn;
        if (!postUrn) {
          const postUrnRegex = /(urn:li:activity:\d+)/;
          const match = sender.tab?.url?.match(postUrnRegex);
          postUrn = match && match[1] ? match[1] : undefined;
        }

        if (!postUrn) {
          sendResponse({
            status: 'error',
            message: 'No post URN available for export.',
          });
          return;
        }

        let state = getPostState(postUrn);
        if (!state) {
          state = await loadPostState(postUrn);
        }
        if (!state) {
          sendResponse({
            status: 'error',
            message: `No state found for post ${postUrn}`,
          });
          return;
        }
        // Expose for E2E verification without relying on downloads
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (self as any).__E2E_LAST_EXPORTED_STATE = state;
        sendResponse({ status: 'success', data: state });
      } catch (error) {
        logger.error('Failed to export JSON', error);
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true;
  }

  if (message.type === 'UPDATE_AI_CONFIG') {
    (async () => {
      try {
        await configInitializationPromise;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { apiKey: _apiKey, ...safeConfig } =
          message.payload as Partial<AIConfig>;
        logger.info('Received request to update AI config', {
          config: safeConfig,
        });
        await updateConfig(message.payload as Partial<AIConfig>);
        sendResponse({ status: 'success' });
      } catch (error) {
        logger.error('Failed to update AI config', error);
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true; // Indicate async response
  }

  if (message.type === 'GET_AI_CONFIG') {
    logger.info('Received request for AI config.');
    (async () => {
      try {
        await configInitializationPromise;
        const config = getConfig();
        sendResponse({ status: 'success', payload: config });
      } catch (error) {
        logger.error('Failed to get AI config', error);
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true; // Indicate async response
  }

  if (message.type === 'GET_MODELS') {
    logger.info('Received request to get models from OpenRouter.');
    (async () => {
      try {
        await configInitializationPromise;
        const config = getConfig();
        // Use API key from payload for testing, otherwise use saved key.
        const apiKeyToUse = message.payload?.apiKey || config.apiKey;
        if (!apiKeyToUse) {
          throw new Error('OpenRouter API key is not set.');
        }
        const client = new OpenRouterClient(apiKeyToUse, config.attribution);
        const models = await client.getModels();

        // Filter and sort models before sending to UI
        const filteredModels = models.filter((model) => {
          // If filters are not defined, include the model by default.
          if (!config.modelFilters) {
            return true;
          }
          const meetsContextRequirement =
            model.context_length >= config.modelFilters.minContext;
          let isTextOnly = true;
          if (config.modelFilters.onlyTextOutput) {
            // A simple filter to exclude models that are likely not for text generation.
            isTextOnly = !/vision|image|audio/.test(model.id);
          }
          return meetsContextRequirement && isTextOnly;
        });

        const curated: OpenRouterModel[] = [];
        const others: OpenRouterModel[] = [];

        // Separate models into curated and others
        filteredModels.forEach((model) => {
          if (CURATED_MODELS.includes(model.id)) {
            curated.push(model);
          } else {
            others.push(model);
          }
        });

        // Sort curated models to match the defined order
        curated.sort(
          (a, b) => CURATED_MODELS.indexOf(a.id) - CURATED_MODELS.indexOf(b.id)
        );

        // Sort other models alphabetically by name
        others.sort((a, b) => a.name.localeCompare(b.name));

        const sortedModels = [...curated, ...others];

        sendResponse({ status: 'success', payload: sortedModels });
      } catch (error) {
        logger.error('Failed to fetch models from OpenRouter', error);
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true; // Indicate async response
  }

  if (message.type === 'START_PIPELINE') {
    (async () => {
      try {
        await configInitializationPromise;
        const { postUrn, maxComments } = message.payload as {
          postUrn: string;
          maxComments?: number;
        };
        const tabId = sender.tab?.id;
        if (!tabId) {
          throw new Error('Could not get tab ID to start pipeline.');
        }
        logger.info('Received START_PIPELINE message', {
          postUrn,
          tabId,
          maxComments,
        });
        await startPipeline(postUrn, tabId, maxComments);
        sendResponse({ status: 'success' });
      } catch (error) {
        logger.error('Failed to start pipeline', error, {
          payload: message.payload,
        });
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true;
  }

  if (message.type === 'GET_PIPELINE_STATUS') {
    (async () => {
      try {
        await configInitializationPromise;
        const status = getPipelineStatus();
        sendResponse({ status: 'success', payload: status });
      } catch (error) {
        logger.error('Failed to retrieve pipeline status', error);
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true;
  }

  if (message.type === 'STOP_PIPELINE') {
    (async () => {
      try {
        await configInitializationPromise;
        logger.info('Received STOP_PIPELINE message');
        await stopPipeline();
        sendResponse({ status: 'success' });
      } catch (error) {
        logger.error('Failed to stop pipeline', error);
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true;
  }

  if (message.type === 'RESUME_PIPELINE') {
    (async () => {
      try {
        await configInitializationPromise;
        const postUrn =
          (message.postUrn as string) ||
          (message.payload?.postUrn as string) ||
          undefined;
        const tabId = sender.tab?.id;
        logger.info('Received RESUME_PIPELINE message', { postUrn, tabId });
        await resumePipeline(postUrn, tabId);
        sendResponse({ status: 'success' });
      } catch (error) {
        logger.error('Failed to resume pipeline', error);
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true;
  }

  // Reset pipeline to idle without clearing saved state
  if (message.type === 'RESET_PIPELINE') {
    (async () => {
      try {
        await configInitializationPromise;
        const postUrn =
          (message.postUrn as string) ||
          (message.payload?.postUrn as string) ||
          (() => {
            const m = sender.tab?.url?.match(/(urn:li:activity:\d+)/);
            return m && m[1] ? m[1] : undefined;
          })();
        logger.info('Received RESET_PIPELINE request', { postUrn });
        await resetPipeline(postUrn);
        sendResponse({ status: 'success' });
      } catch (error) {
        logger.error('Failed to reset pipeline', error);
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true;
  }

  if (message.type === 'RESET_SESSION') {
    (async () => {
      try {
        await configInitializationPromise;
        const postUrn =
          (message.postUrn as string) ||
          (message.payload?.postUrn as string) ||
          (() => {
            const m = sender.tab?.url?.match(/(urn:li:activity:\d+)/);
            return m && m[1] ? m[1] : undefined;
          })();
        logger.info('Received RESET_SESSION request', { postUrn });
        if (!postUrn) {
          sendResponse({
            status: 'error',
            message: 'No post URN available to reset.',
          });
          return;
        }
        await resetPipeline(postUrn);
        await clearPostState(postUrn);
        broadcastStateUpdate({
          isInitializing: false,
          pipelineStatus: 'idle',
          comments: [],
          postUrn,
        });
        sendResponse({ status: 'success' });
      } catch (error) {
        logger.error('Failed to reset session', error);
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true;
  }

  if (message.type === 'PROCESS_CAPTURED_STATE') {
    const { postUrn, comments } = message.payload;
    logger.info('Received captured state from content script', {
      postUrn,
      commentCount: comments.length,
    });
    mergeCapturedState(postUrn, { comments });
    // Recompute and broadcast stats if we have user context
    const state = getPostState(postUrn);
    if (state) {
      const stats = calculateCommentStats(
        state.comments.map((c) => ({
          type: c.type,
          threadId: c.threadId,
          ownerProfileUrl: c.ownerProfileUrl,
        })),
        state._meta.userProfileUrl || ''
      );
      broadcastStateUpdate({ stats });
    }
    // This is a fire-and-forget operation, no response needed.
    return false;
  }

  return true;
});

// Expose a helper for E2E tests to inject state.
// This is available only in non-production builds.
// Note: The condition is removed to allow E2E tests to run against production builds.
// In a real-world scenario, a dedicated 'test' build mode would be preferable.
// if (import.meta.env.MODE !== 'production') {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).__E2E_TEST_SAVE_POST_STATE = (
  postUrn: string,
  state: PostState
) => savePostState(postUrn, state);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).__E2E_TEST_GET_POST_STATE = (postUrn: string) =>
  getPostState(postUrn);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).__E2E_TEST_UPDATE_CONFIG = (config: Partial<AIConfig>) =>
  updateConfig(config);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).__E2E_TEST_SET_LOGS = (logs: LogEntry[]) =>
  logger.setBufferedLogsForTesting(logs);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).__E2E_TEST_HOOKS_INSTALLED = true;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).__E2E_TEST_CAPTURE_NOW = (matchUrl?: string) => {
  return new Promise((resolve, reject) => {
    try {
      const patterns = matchUrl ? [matchUrl] : ['https://www.linkedin.com/*'];
      chrome.tabs.query({ url: patterns }, async (tabs) => {
        const target = tabs && tabs[0];
        if (!target || !target.id) {
          reject(new Error('No matching LinkedIn tab found for capture.'));
          return;
        }
        try {
          const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: target.id! },
            world: 'MAIN',
            func: async () => {
              const delay = (ms: number) =>
                new Promise((r) => setTimeout(r, ms));
              await delay(500);
              for (let i = 0; i < 15; i++) {
                window.scrollTo(0, document.body.scrollHeight);
                // Try to click any visible 'more comments' buttons between scrolls
                const buttons = Array.from(
                  document.querySelectorAll('button, a')
                ) as (HTMLButtonElement | HTMLAnchorElement)[];
                for (const b of buttons) {
                  const t = (b.textContent || '').toLowerCase();
                  if (/more/.test(t) && /comment/.test(t)) {
                    try {
                      (b as HTMLElement).click();
                    } catch {}
                  }
                }
                await delay(800);
              }
              window.scrollTo(0, 0);
              await delay(300);

              const pick = (el: Element | null, sel: string): Element | null =>
                el ? (el as Element).querySelector(sel) : null;
              let nodes: HTMLElement[] = Array.from(
                document.querySelectorAll<HTMLElement>(
                  'article.comments-comment-entity:not(.comments-comment-entity--reply)'
                )
              );
              if (nodes.length === 0) {
                nodes = Array.from(
                  document.querySelectorAll<HTMLElement>(
                    '[data-id^="urn:li:comment:"]'
                  )
                );
              }
              if (nodes.length === 0) {
                nodes = Array.from(
                  document.querySelectorAll<HTMLElement>(
                    '[data-urn*="urn:li:comment:"]'
                  )
                );
              }
              const comments: {
                commentId: string;
                ownerProfileUrl: string;
                text: string;
                timestamp: string;
                type: string;
                threadId: string;
              }[] = [];
              nodes.forEach((commentElement) => {
                const dataId = commentElement.getAttribute('data-id') || '';
                const ownerRel =
                  (
                    pick(
                      commentElement,
                      'a.comments-comment-meta__image-link, a.app-aware-link'
                    ) as HTMLAnchorElement | null
                  )?.getAttribute('href') || '';
                const owner = ownerRel
                  ? ownerRel.startsWith('https://')
                    ? ownerRel
                    : `https://www.linkedin.com${ownerRel}`
                  : '';
                const text = (
                  (
                    pick(
                      commentElement,
                      'span.comments-comment-item__main-content'
                    ) as HTMLElement | null
                  )?.innerText ||
                  (
                    pick(
                      commentElement,
                      'span[dir="ltr"], p[dir="ltr"], span, p'
                    ) as HTMLElement | null
                  )?.innerText ||
                  ''
                ).trim();
                const timestamp =
                  (
                    commentElement.querySelector(
                      'time, span[datetime], time[datetime]'
                    ) as HTMLElement | null
                  )?.innerText?.trim() || '';
                const isReply = !!commentElement.parentElement?.closest(
                  'div.comments-comment-item__replies-container'
                );
                const threadId = isReply
                  ? commentElement.parentElement
                      ?.closest('div.comments-comment-item__replies-container')
                      ?.closest('article.comments-comment-entity')
                      ?.getAttribute('data-id') || ''
                  : dataId;
                if (dataId && owner && text && timestamp && threadId) {
                  comments.push({
                    commentId: dataId,
                    ownerProfileUrl: owner,
                    text,
                    timestamp,
                    type: isReply ? 'reply' : 'top-level',
                    threadId,
                  });
                }
              });
              const m = location.href.match(/(urn:li:activity:\d+)/);
              const postUrn = m && m[1] ? m[1] : null;
              return { postUrn, comments, postUrl: location.href };
            },
          } as chrome.scripting.ScriptInjection<[], unknown>);

          const response = (result || {}) as {
            postUrn?: string | null;
            comments?: unknown[];
            postUrl?: string;
          };
          let postUrn = response?.postUrn;
          if (!postUrn) {
            const urlToParse = response?.postUrl || target.url || '';
            const m = urlToParse.match(/(urn:li:activity:\d+)/);
            postUrn = m && m[1] ? m[1] : null;
          }
          if (!postUrn) {
            reject(new Error('Capture returned no postUrn.'));
            return;
          }
          const state: PostState = {
            _meta: {
              postId: postUrn,
              postUrl:
                target.url ||
                `https://www.linkedin.com/feed/update/${postUrn}/`,
              lastUpdated: new Date().toISOString(),
              runState: 'idle',
              userProfileUrl: '',
            },
            comments: (Array.isArray(response.comments)
              ? (response.comments as ParsedComment[])
              : []
            ).map((c) => ({
              ...c,
              likeStatus: '',
              replyStatus: '',
              dmStatus: '',
              attempts: { like: 0, reply: 0, dm: 0 },
              lastError: '',
              pipeline: {
                queuedAt: new Date().toISOString(),
                likedAt: '',
                repliedAt: '',
                dmAt: '',
              },
            })),
          };
          await savePostState(postUrn, state);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (self as any).__E2E_LAST_EXPORTED_STATE = state;
          resolve(state);
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
};
console.log('[BACKGROUND SCRIPT] E2E test hooks installed.');
// }
