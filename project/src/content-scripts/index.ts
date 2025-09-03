~~~edits
***start_edit
LITERAL
***search
import { likeComment, replyToComment, sendDm } from './domInteractor';
***replace
import { mountApp } from '../ui';
import css from '../index.css?inline';
import { likeComment, replyToComment, sendDm } from './domInteractor';
***description
Import the UI mounting function and CSS styles as a string. This is necessary to correctly inject the application and its styles into the shadow DOM.
***end_edit
***start_edit
LITERAL
***search
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
***replace
// Check if document is ready
console.log('Content script starting...');

// Function to initialize the content script
const initializeContentScript = () => {
  try {
    console.log('Initializing content script...');

    // Create a host element for the shadow DOM
    const host = document.createElement('div');
    host.className = 'sidebar';
    document.body.appendChild(host);

    // Create shadow DOM root
    const shadowRoot = host.attachShadow({ mode: 'open' });

    // Inject styles
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
***description
Update the content script initializer to inject the full CSS from the imported stylesheet and mount the Preact application into the shadow DOM. This fixes the core issue where the UI was not being rendered, which would cause the e2e test to fail.
***end_edit