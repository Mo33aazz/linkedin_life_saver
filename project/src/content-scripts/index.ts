import { likeComment, replyToComment, sendDm } from './domInteractor';
import { mountApp } from '../ui';
import css from '../index.css?inline';

// Check if document is ready
console.log('Content script starting...');

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'LIKE_COMMENT') {
    console.log('Content script received LIKE_COMMENT:', message.payload);
    const { commentId } = message.payload as { commentId: string };
    if (!commentId) {
      sendResponse({ status: 'error', message: 'No commentId provided.' });
      return true;
    }

    likeComment(commentId)
      .then((success: boolean) => {
        sendResponse({ status: 'success', payload: success });
      })
      .catch((error: unknown) => {
        sendResponse({ status: 'error', message: (error as Error).message });
      });

    return true; // Indicates async response
  }

  if (message.type === 'REPLY_TO_COMMENT') {
    console.log('Content script received REPLY_TO_COMMENT:', message.payload);
    const { commentId, replyText } = message.payload as {
      commentId: string;
      replyText: string;
    };
    if (!commentId || replyText === undefined) {
      sendResponse({
        status: 'error',
        message: 'No commentId or replyText provided.',
      });
      return true;
    }

    replyToComment(commentId, replyText)
      .then((success: boolean) => {
        sendResponse({ status: 'success', payload: success });
      })
      .catch((error: unknown) => {
        sendResponse({ status: 'error', message: (error as Error).message });
      });

    return true; // Indicates async response
  }

  if (message.type === 'SEND_DM') {
    console.log('Content script received SEND_DM:', message.payload);
    const { dmText } = message.payload as { dmText: string };
    if (dmText === undefined) {
      sendResponse({
        status: 'error',
        message: 'No dmText provided.',
      });
      return true;
    }

    sendDm(dmText)
      .then((success: boolean) => {
        sendResponse({ status: 'success', payload: success });
      })
      .catch((error: unknown) => {
        sendResponse({ status: 'error', message: (error as Error).message });
      });

    return true; // Indicates async response
  }
  // Keep the listener open for other messages
  return true;
});