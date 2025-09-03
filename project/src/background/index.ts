// This is the service worker script.
// It will house the core orchestration logic, state management, and API calls.
import {
  calculateCommentStats,
  savePostState,
  loadAllStates,
  getPostState,
} from './services/stateManager';
import {
  initPipelineManager,
  startPipeline,
  stopPipeline,
  resumePipeline,
  getPipelineStatus,
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
} from '../shared/types';
import { OpenRouterClient } from './services/openRouterClient';

console.log('LinkedIn Engagement Assistant Service Worker loaded.');

// Load all persisted states into memory on startup
loadAllStates();

// Initialize the configuration on startup.
initializeConfig();

const sendMessageToTab = <T>(
  tabId: number,
  message: { type: string; payload?: unknown }
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (response && response.status === 'success') {
        resolve(response.payload as T);
      } else {
        reject(
          new Error(
            response?.message || 'Content script action failed or did not respond.'
          )
        );
      }
    });
  });
};

// Initialize the pipeline manager with a broadcaster function.
initPipelineManager(broadcastStateUpdate, sendMessageToTab);

// A curated list of popular and recommended models to show at the top.
const CURATED_MODELS = [
  'anthropic/claude-3.5-sonnet',
  'google/gemini-pro-1.5',
  'mistralai/mistral-large',
  'openai/gpt-4o',
];

/**
 * Broadcasts the latest state to all UI components.
 * @param state The partial state to broadcast.
 */
const broadcastStateUpdate = (state: Partial<UIState>) => {
  console.log('Broadcasting state update:', state);
  chrome.runtime.sendMessage({
    type: 'STATE_UPDATE',
    payload: state,
  });
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ping') {
    console.log('Received ping from UI, sending pong back.');
    sendResponse({ payload: 'pong' });
    // Return true to indicate you wish to send a response asynchronously.
    return true;
  }

  if (message.type === 'COMMENTS_PARSED') {
    // Assuming a richer payload that includes post metadata
    const { comments, userProfileUrl, postUrn, postUrl } = message.payload;
    if (!comments || !userProfileUrl || !postUrn || !postUrl) {
      console.error('Invalid payload received for COMMENTS_PARSED');
      sendResponse({ status: 'error', message: 'Invalid payload' });
      return true;
    }

    const stats = calculateCommentStats(comments, userProfileUrl);

    // Log the results to meet acceptance criteria
    console.log('Calculated Comment Stats:', stats);

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
    console.log('Received request for post state export.');
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
    console.log('Received request to update AI config:', message.payload);
    updateConfig(message.payload as Partial<AIConfig>)
      .then(() => {
        sendResponse({ status: 'success' });
      })
      .catch((error) => {
        console.error('Failed to update AI config:', error);
        sendResponse({ status: 'error', message: error.message });
      });
    return true; // Indicate async response
  }

  if (message.type === 'GET_AI_CONFIG') {
    console.log('Received request for AI config.');
    (async () => {
      try {
        const config = getConfig();
        sendResponse({ status: 'success', payload: config });
      } catch (error) {
        console.error('Failed to get AI config:', error);
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true; // Indicate async response
  }

  if (message.type === 'GET_MODELS') {
    console.log('Received request to get models from OpenRouter.');
    (async () => {
      try {
        const config = getConfig();
        if (!config.apiKey) {
          throw new Error('OpenRouter API key is not set.');
        }
        const client = new OpenRouterClient(config.apiKey, config.attribution);
        const models = await client.getModels();

        // Filter and sort models before sending to UI
        const filteredModels = models.filter((model) => {
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
        console.error('Failed to fetch models from OpenRouter:', error);
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true; // Indicate async response
  }

  if (message.type === 'START_PIPELINE') {
    const { postUrn } = message.payload as { postUrn: string };
    const tabId = sender.tab?.id;
    if (!tabId) {
      const errorMsg = 'Could not get tab ID to start pipeline.';
      console.error(errorMsg);
      sendResponse({ status: 'error', message: errorMsg });
      return true;
    }
    console.log(`Received START_PIPELINE for ${postUrn} on tab ${tabId}`);
    startPipeline(postUrn, tabId).then(() => {
      sendResponse({ status: 'success' });
    });
    return true;
  }

  if (message.type === 'STOP_PIPELINE') {
    console.log('Received STOP_PIPELINE');
    stopPipeline().then(() => {
      sendResponse({ status: 'success' });
    });
    return true;
  }

  if (message.type === 'RESUME_PIPELINE') {
    console.log('Received RESUME_PIPELINE');
    resumePipeline().then(() => {
      sendResponse({ status: 'success' });
    });
    return true;
  }

  return true;
});