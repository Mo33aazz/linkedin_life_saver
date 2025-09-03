import { mountApp } from '../ui';
import css from '../index.css?inline';

console.log('Content script starting...');

/**
 * Injects the UI into the page.
 */
const initializeContentScript = () => {
  const hostSelector = 'sidebar';
  // Prevent re-injection.
  if (document.querySelector(`div.${hostSelector}`)) {
    console.log('Sidebar already injected. Skipping.');
    return;
  }

  try {
    console.log('Initializing content script...');

    // Create a host element for the shadow DOM
    const host = document.createElement('div');
    host.className = hostSelector;
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

// Run the initialization logic.
// We also want to avoid injecting into iframes.
if (window.self === window.top) {
  // The default `run_at` is `document_idle`, so the DOM should be ready.
  initializeContentScript();
}