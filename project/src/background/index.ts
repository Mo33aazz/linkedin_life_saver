// This is the service worker script.
// It will house the core orchestration logic, state management, and API calls.
console.log('LinkedIn Engagement Assistant Service Worker loaded.');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ping') {
    console.log('Received ping from UI, sending pong back.');
    sendResponse({ payload: 'pong' });
    // Return true to indicate you wish to send a response asynchronously.
    return true;
  }
});