import { likeComment, replyToComment, sendDm } from './domInteractor';
import { mountApp } from '../ui';
import css from '../index.css?inline';
import { useStore } from '../ui/store';
import { LogEntry, UIState } from '../shared/types';
// Check if document is ready
console.log('Content script starting...');


chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

    console.log('[Content Script] Message received:', message.type);

  // --- NEW: Handle State and Log Updates ---
  if (message.type === 'STATE_UPDATE') {
    console.log('Content script received STATE_UPDATE:', message.payload);
    const newState = message.payload as Partial<UIState>;
    // Directly call the action on the imported store
    useStore.getState().updateState(newState);
    // No response needed for broadcast updates
    return; // This is a fire-and-forget message
  }

  if (message.type === 'LOG_ENTRY') {
    console.log('Content script received LOG_ENTRY:', message.payload);
    const newLog = message.payload as LogEntry;
    // Directly call the action on the imported store
    useStore.getState().addLog(newLog);
    // No response needed for broadcast updates
    return; // This is a fire-and-forget message
  }

  // --- EXISTING: Handle DOM Actions ---
  if (message.type === 'LIKE_COMMENT') {
    console.log('Content script received LIKE_COMMENT:', message.payload);
    likeComment(message.payload.commentId)
      .then(success => sendResponse({ status: 'success', payload: success }))
      .catch(error => sendResponse({ status: 'error', message: error.message }));
    return true; // Indicates async response
  }

  if (message.type === 'REPLY_TO_COMMENT') {
    console.log('Content script received REPLY_TO_COMMENT:', message.payload);
    replyToComment(message.payload.commentId, message.payload.replyText)
      .then(success => sendResponse({ status: 'success', payload: success }))
      .catch(error => sendResponse({ status: 'error', message: error.message }));
    return true; // Indicates async response
  }

  if (message.type === 'SEND_DM') {
    console.log('Content script received SEND_DM:', message.payload);
    sendDm(message.payload.dmText)
      .then(success => sendResponse({ status: 'success', payload: success }))
      .catch(error => sendResponse({ status: 'error', message: error.message }));
    return true; // Indicates async response
  }

  return true; // Keep listener open for other potential async messages
});

// Function to initialize the content script
const initializeContentScript = () => {

  if (document.querySelector('div.sidebar')) {
    console.log('Sidebar already injected. Skipping.');
    return;
  }

  try {
    console.log('Initializing content script...');

    // Create a host element for the shadow DOM
    console.log('Attempting to create host element...');
    const host = document.createElement('div');
    host.id = 'linkedin-engagement-assistant-root';
    host.className = 'sidebar';

    console.log('Attempting to append to document.body...');
    document.body.appendChild(host);
    console.log('Successfully appended host element');

    // Create shadow DOM root
    console.log('Attempting to create shadow DOM...');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    console.log('Successfully created shadow DOM');

    // Inject styles into the shadow DOM
    const styleElement = document.createElement('style');
    styleElement.textContent = css;
    shadowRoot.appendChild(styleElement);

    // Create a root for the Preact app
    const appRoot = document.createElement('div');
    appRoot.id = 'app-root';
    shadowRoot.appendChild(appRoot);

    // Mount the Preact app
    mountApp(appRoot);

    console.log('Successfully mounted UI into shadow DOM');
  } catch (error) {
    console.error('Error setting up content script:', error);
  }
};

// Check if document is ready or wait for it to be ready
if (document.readyState === 'loading') {
  console.log('Document is still loading, waiting for DOMContentLoaded...');
  document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
  console.log('Document is already loaded, initializing immediately...');
  initializeContentScript();
}