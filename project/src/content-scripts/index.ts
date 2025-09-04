import {
  likeComment,
  replyToComment,
  sendDm,
  capturePostStateFromDOM,
} from './domInteractor';
import { mountApp } from '../ui';
import css from '../index.css?inline';

console.log('Content script starting...');

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Content Script] Message received:', message.type);

  // DOM actions are handled here.
  // STATE_UPDATE and LOG_ENTRY are handled by the listener in App.tsx
  // to ensure they are tied to the UI lifecycle.

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

  if (message.type === 'CAPTURE_POST_STATE') {
    console.log('Content script received CAPTURE_POST_STATE');
    try {
      const postStateData = capturePostStateFromDOM();
      sendResponse({ status: 'success', payload: postStateData });
    } catch (error) {
      sendResponse({ status: 'error', message: (error as Error).message });
    }
    return true; // Indicates async response
  }

  return true; // Keep listener open for other potential async messages
});

// Function to initialize the content script
const initializeContentScript = () => {
  if (document.getElementById('linkedin-engagement-assistant-root')) {
    console.log('Sidebar host element already exists. Skipping injection.');
    return;
  }

  try {
    console.log('Initializing content script...');

    // Create a host element for the shadow DOM
    console.log('Attempting to create host element...');
    const host = document.createElement('div');
    host.id = 'linkedin-engagement-assistant-root';
    host.className = 'sidebar';
    // Style the host element directly. Styles injected via the `css` import
    // will be scoped to the shadow DOM and won't affect the host.
    Object.assign(host.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      width: '380px',
      height: '100vh',
      zIndex: '99999',
      borderLeft: '1px solid #e0e0e0',
      boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
      backgroundColor: '#fff',
    });

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