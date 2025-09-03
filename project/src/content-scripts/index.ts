import { likeComment, replyToComment, sendDm } from './domInteractor';

// CSS styles as a string (copied from ../index.css)
const sidebarStyles = `
  .sidebar {
    position: fixed;
    top: 15px;
    right: 15px;
    width: 320px;
    height: 95vh;
    background-color: #f0f2f5;
    border: 1px solid #ccc;
    border-radius: 8px;
    z-index: 9999;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  .sidebar div {
    padding: 16px;
    color: #333;
  }
  .sidebar h1 {
    font-size: 18px;
    margin: 0 0 10px 0;
    color: #111;
  }
  .sidebar p {
    font-size: 14px;
    margin: 0;
  }
`;

// Check if document is ready
console.log('Content script starting...');

// Function to initialize the content script
const initializeContentScript = () => {
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

  // Create a style element to style the sidebar within the shadow DOM
  const style = document.createElement('style');
  style.textContent = `
    :host {
      display: block;
    }
  `;

  // Inject styles into the shadow DOM
  const styleElement = document.createElement('style');
  styleElement.textContent = sidebarStyles;
  shadowRoot.appendChild(styleElement);
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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