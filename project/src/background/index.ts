// This is the service worker script.
// It will house the core orchestration logic, state management, and API calls.
import {
  calculateCommentStats,
  savePostState,
  loadAllStates,
  getPostState,
  mergeCapturedState,
  loadPostState,
} from './services/stateManager';
import {
  initPipelineManager,
  startPipeline,
  stopPipeline,
  resumePipeline,
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
} from '../shared/types';
import { OpenRouterClient } from './services/openRouterClient';
import { logger } from './logger';

// Define the broadcaster function
const broadcastLog = (logEntry: LogEntry) => {
  // Fire-and-forget broadcast for logs.
  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.id) {
      logger.warn('No active tab found to send state update.');
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: 'LOG_ENTRY', payload: logEntry })
      .catch(error => {
        if (error.message.includes('Receiving end does not exist')) {
          // Expected error when no UI is listening. Safe to ignore.
        } else {
          // Use console.warn directly to avoid recursive logging loop if logger is broken.
          console.warn('An unexpected error occurred during log broadcast', error);
        }
      });
  })();
};

// Initialize the logger
logger.initialize(broadcastLog);

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
  logger.info('Broadcasting state update', { state });
  // This is a fire-and-forget broadcast. The promise it returns may be
  // rejected if no UI component is open to receive it. We can safely
  // ignore this rejection as it's an expected condition.
  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.id) {
      logger.warn('No active tab found to send state update.');
      return;
    }
    chrome.tabs.sendMessage(tab.id, {
      type: 'STATE_UPDATE',
      payload: state,
    }).catch(error => {
      if (error.message.includes('Receiving end does not exist')) {
        // Expected error when no UI is listening. Safe to ignore.
      } else {
        logger.warn('An unexpected error occurred during state broadcast', error);
      }
    });
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
  return new Promise<T>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        const error = new Error(chrome.runtime.lastError.message);
        logger.error('Error sending message to tab', error, { tabId, message });
        return reject(error);
      }
      if (response && response.status === 'success') {
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
loadAllStates().then(() => {
  // broadcastStateUpdate can be called here if needed to inform UI of loaded states
  logger.info('All post states loaded into memory.');
}).catch(error => {
  logger.error('Failed to load post states on startup', error);
});
// Initialize the pipeline manager with a broadcaster function.
initPipelineManager(broadcastStateUpdate, sendMessageToTab);

// A curated list of popular and recommended models to show at the top.
const CURATED_MODELS = [
  'anthropic/claude-3.5-sonnet',
  'google/gemini-pro-1.5',
  'mistralai/mistral-large',
  'openai/gpt-4o',
];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
          logger.info('Found existing state for this post, broadcasting to UI.', {
            postUrn,
          });
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

    // Create and save the full post state
    const postMeta: Post = {
      postId: postUrn,
      postUrl,
      lastUpdated: new Date().toISOString(),
      runState: 'idle',
    };

    const postState: PostState = {
      _meta: postMeta,
      comments,
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
        const { postUrn } = message.payload as { postUrn: string };
        const tabId = sender.tab?.id;
        if (!tabId) {
          throw new Error('Could not get tab ID to start pipeline.');
        }
        logger.info('Received START_PIPELINE message', { postUrn, tabId });
        await startPipeline(postUrn, tabId);
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
        logger.info('Received RESUME_PIPELINE message');
        await resumePipeline();
        sendResponse({ status: 'success' });
      } catch (error) {
        logger.error('Failed to resume pipeline', error);
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true;
  }

  if (message.type === 'PROCESS_CAPTURED_STATE') {
    const { postUrn, comments } = message.payload;
    logger.info('Received captured state from content script', { postUrn, commentCount: comments.length });
    mergeCapturedState(postUrn, { comments });
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
(self as any).__E2E_TEST_SAVE_POST_STATE = (postUrn: string, state: PostState) => savePostState(postUrn, state);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).__E2E_TEST_UPDATE_CONFIG = (config: Partial<AIConfig>) => updateConfig(config);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).__E2E_TEST_HOOKS_INSTALLED = true;
console.log('[BACKGROUND SCRIPT] E2E test hooks installed.');
// }