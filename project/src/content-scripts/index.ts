~~~edits
#- file: src/content-scripts/index.ts
***start_edit
LITERAL
***search
import { init } from '../ui';
***replace
import { init } from '../ui';
import sidebarStyles from '../index.css?inline';
***description
Import the sidebar CSS as an inline string to be injected into the shadow DOM. This is necessary for styling the Preact components rendered within the shadow root.
***end_edit
***start_edit
LITERAL
***search
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
***replace
// 4. Inject styles into the shadow DOM
const styleElement = document.createElement('style');
styleElement.textContent = sidebarStyles;
shadowRoot.appendChild(styleElement);
***description
Replace the hardcoded styles with the imported CSS file content. This ensures that the Preact components are styled correctly and that all styles are managed in a single, centralized CSS file.
***end_edit