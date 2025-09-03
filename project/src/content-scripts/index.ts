import { init } from '../ui';

console.log('LinkedIn Engagement Assistant Content Script loaded.');

// 1. Create a container element for the UI
const rootId = 'linkedin-engagement-assistant-root';
let root = document.getElementById(rootId);

if (!root) {
  root = document.createElement('div');
  root.id = rootId;
  document.body.appendChild(root);
}

// 2. Attach a shadow root to the container
const shadowRoot = root.attachShadow({ mode: 'open' });

// 3. Create a mount point for the Preact app inside the shadow root
const mountPoint = document.createElement('div');
shadowRoot.appendChild(mountPoint);

// 4. Create a style element to style the sidebar within the shadow DOM
const style = document.createElement('style');
style.textContent = `
  :host {
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
  div {
    padding: 16px;
    color: #333;
  }
  h1 {
    font-size: 18px;
    margin: 0 0 10px 0;
    color: #111;
  }
  p {
    font-size: 14px;
    margin: 0;
  }
`;
shadowRoot.appendChild(style);

// 5. Render the Preact UI into the mount point
init(mountPoint);