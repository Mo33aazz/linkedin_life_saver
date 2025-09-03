// This is the service worker script.
// It will house the core orchestration logic, state management, and API calls.
import {
  calculateCommentStats,
  savePostState,
  loadAllStates,
  getPostState,
} from './services/stateManager';
import {
  initializeConfig,
  updateConfig,
  getConfig,
} from './services/configManager';
import { Post, PostState, UIState, AIConfig } from '../shared/types';
import { OpenRouterClient } from './services/openRouterClient';

console.log('LinkedIn Engagement Assistant Service Worker loaded.');

// Load all persisted states into memory on startup
loadAllStates();

// Initialize the configuration on startup.
initializeConfig();

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
        sendResponse({ status: 'success', payload: models });
      } catch (error) {
        console.error('Failed to fetch models from OpenRouter:', error);
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true; // Indicate async response
  }

  return true;
});