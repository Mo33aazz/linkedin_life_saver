// This is the service worker script.
// It will house the core orchestration logic, state management, and API calls.
import { calculateCommentStats } from './services/stateManager';

console.log('LinkedIn Engagement Assistant Service Worker loaded.');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ping') {
    console.log('Received ping from UI, sending pong back.');
    sendResponse({ payload: 'pong' });
    // Return true to indicate you wish to send a response asynchronously.
    return true;
  }

  if (message.type === 'COMMENTS_PARSED') {
    const { comments, userProfileUrl } = message.payload;
    if (!comments || !userProfileUrl) {
      console.error('Invalid payload received for COMMENTS_PARSED');
      sendResponse({ status: 'error', message: 'Invalid payload' });
      return true;
    }

    const stats = calculateCommentStats(comments, userProfileUrl);

    // Log the results to meet acceptance criteria
    console.log('Calculated Comment Stats:', stats);

    sendResponse({ status: 'success', stats });
    return true; // Keep the message channel open for async response
  }
});