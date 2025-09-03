// This is the service worker script.
// It will house the core orchestration logic, state management, and API calls.
import {
  calculateCommentStats,
  savePostState,
  loadAllStates,
} from './services/stateManager';
import { Post, PostState, UIState } from '../shared/types';

console.log('LinkedIn Engagement Assistant Service Worker loaded.');

// Load all persisted states into memory on startup
loadAllStates();

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
});