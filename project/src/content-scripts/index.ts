import { likeComment, replyToComment, sendDm, sendDmViaProfile } from './domInteractor';
import { mountApp, unmountApp } from '../ui';
import css from '../index.css?inline';

console.log('Content script starting...');

// UI layout and scale settings
const SIDEBAR_WIDTH = 500; // slightly wider for better fit and no cropping
const UI_FONT_SCALE = 1.5; // scale base font-size (affects Tailwind rem units)

const isOnLinkedInPost = (): boolean => {
  try {
    const href = window.location.href;
    // Match: https://www.linkedin.com/feed/update/urn:li:activity:123456/
    // Allow optional trailing params or missing trailing slash
    return /^https:\/\/www\.linkedin\.com\/feed\/update\/urn:li:activity:\d+\/?(\?.*)?$/.test(href);
  } catch {
    return false;
  }
};

let hostEl: HTMLElement | null = null;
let appRootEl: HTMLElement | null = null;
let toggleEl: HTMLButtonElement | null = null;
let layoutStyleEl: HTMLStyleElement | null = null;
let sidebarOpen = true; // default open to preserve existing behavior/tests

// ---- Sidebar toggle and page layout shift helpers ----
const ensureToggleButton = () => {
  if (toggleEl) return;
  const btn = document.createElement('button');
  btn.id = 'lea-toggle';
  Object.assign(btn.style, {
    position: 'fixed',
    top: '50%',
    transform: 'translateY(-50%)',
    right: '8px',
    width: '36px',
    height: '36px',
    borderRadius: '18px',
    border: 'none',
    background: '#0a66c2',
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    zIndex: '100000',
  } as Partial<CSSStyleDeclaration>);
  btn.title = 'Toggle Assistant Sidebar';
  btn.textContent = sidebarOpen ? '‹' : '›';
  btn.addEventListener('click', () => {
    if (sidebarOpen) {
      // hide the sidebar but keep it mounted
      if (hostEl) hostEl.style.display = 'none';
      removeContentShift();
      sidebarOpen = false;
    } else {
      if (hostEl) hostEl.style.display = 'block';
      else injectUI();
      applyContentShift(true);
      sidebarOpen = true;
    }
    btn.textContent = sidebarOpen ? '‹' : '›';
    updateToggleButtonPosition();
  });
  document.body.appendChild(btn);
  toggleEl = btn;
};

const updateToggleButtonPosition = () => {
  if (!toggleEl) return;
  // When open, place the toggle on the inner edge of the sidebar
  // so it sits near the content area; otherwise keep it near the viewport edge.
  toggleEl.style.right = sidebarOpen ? `${SIDEBAR_WIDTH + 8}px` : '8px';
};

const applyContentShift = (open: boolean) => {
  if (!open) {
    removeContentShift();
    return;
  }
  if (!layoutStyleEl) {
    layoutStyleEl = document.createElement('style');
    layoutStyleEl.id = 'lea-layout-style';
    layoutStyleEl.textContent = `body{margin-right:${SIDEBAR_WIDTH}px !important;}`;
    document.head.appendChild(layoutStyleEl);
  }
};

const removeContentShift = () => {
  if (layoutStyleEl && layoutStyleEl.parentElement) {
    layoutStyleEl.parentElement.removeChild(layoutStyleEl);
  }
  layoutStyleEl = null;
};

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

  if (message.type === 'SEND_DM_VIA_PROFILE') {
    console.log('Content script received SEND_DM_VIA_PROFILE:', message.payload);
    sendDmViaProfile(message.payload.dmText)
      .then(success => sendResponse({ status: 'success', payload: success }))
      .catch(error => sendResponse({ status: 'error', message: error.message }));
    return true; // Indicates async response
  }

  if (message.type === 'CAPTURE_POST_STATE') {
    console.log('Content script received CAPTURE_POST_STATE');
    (async () => {
      try {
        const mod = await import('./domInteractor');
        const payload = message.payload as { noScroll?: boolean; maxComments?: number } || {};
        const disableScroll = Boolean(payload.noScroll);
        const maxComments = payload.maxComments || 10;
        
        if (!disableScroll) {
          // Use the new autoScrollPage function that respects maxComments
          await mod.autoScrollPage(maxComments);
        }
        
        const postStateData = mod.capturePostStateFromDOM(maxComments);
        sendResponse({ status: 'success', payload: postStateData });
      } catch (error) {
        sendResponse({ status: 'error', message: (error as Error).message });
      }
    })();
    return true; // Indicates async response
  }

  // return true; // Keep listener open for other potential async messages
});

// Inject the UI on supported pages
const injectUI = () => {
  if (hostEl || document.getElementById('linkedin-engagement-assistant-root')) {
    console.log('Sidebar already present. Skipping injection.');
    ensureToggleButton();
    applyContentShift(sidebarOpen);
    updateToggleButtonPosition();
    return;
  }
  try {
    const host = document.createElement('div');
    host.id = 'linkedin-engagement-assistant-root';
    host.className = 'sidebar';
    Object.assign(host.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      padding: '0',
      width: `${SIDEBAR_WIDTH}px`,
      height: '100vh',
      zIndex: '99999',
      borderLeft: '1px solid #e0e0e0',
      boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
      backgroundColor: '#fff',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const styleElement = document.createElement('style');
    // Ensure high-contrast text and placeholders within the shadow DOM
    const contrastOverrides = `
      .sidebar input, .sidebar textarea, .sidebar select { color: #111827 !important; caret-color: #111827; }
      .sidebar input::placeholder, .sidebar textarea::placeholder { color: #111827 !important; opacity: 1 !important; }
      .sidebar input::-webkit-input-placeholder, .sidebar textarea::-webkit-input-placeholder { color: #111827 !important; opacity: 1 !important; }
      .sidebar input::-moz-placeholder, .sidebar textarea::-moz-placeholder { color: #111827 !important; opacity: 1 !important; }
      .sidebar input:-ms-input-placeholder, .sidebar textarea:-ms-input-placeholder { color: #111827 !important; opacity: 1 !important; }
    `;
    styleElement.textContent = `${css}\n${contrastOverrides}`;
    shadowRoot.appendChild(styleElement);
    const appRoot = document.createElement('div');
    appRoot.id = 'app-root';
    // Set font scaling for the shadow DOM content (affects rem-based sizes)
    appRoot.style.setProperty('--ui-font-scale', String(UI_FONT_SCALE));
    // Ensure inner sidebar width matches the host width
    appRoot.style.setProperty('--sidebar-width', `${SIDEBAR_WIDTH}px`);
    shadowRoot.appendChild(appRoot);
    mountApp(appRoot);
    hostEl = host;
    appRootEl = appRoot;
    console.log('Mounted sidebar UI');

    ensureToggleButton();
    applyContentShift(sidebarOpen);
    updateToggleButtonPosition();
  } catch (error) {
    console.error('Failed to inject UI:', error);
  }
};

// Remove the UI when not on supported pages
const removeUI = () => {
  try {
    if (appRootEl) {
      unmountApp();
    }
  } catch (e) {
    console.warn('Unmount warning:', e);
  }
  const existing = document.getElementById('linkedin-engagement-assistant-root');
  if (existing && existing.parentElement) {
    existing.parentElement.removeChild(existing);
  }
  hostEl = null;
  appRootEl = null;
  console.log('Sidebar UI removed');

  // Also remove toggle and layout shift when not on a post page
  if (toggleEl && toggleEl.parentElement) toggleEl.parentElement.removeChild(toggleEl);
  toggleEl = null;
  removeContentShift();
};

// Decide whether to show or hide the UI based on URL
const evaluateAndToggleUI = () => {
  if (isOnLinkedInPost()) {
    injectUI();
  } else {
    removeUI();
  }
};

// Check if document is ready or wait for it to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', evaluateAndToggleUI);
} else {
  evaluateAndToggleUI();
}

// Watch for SPA URL changes and toggle UI accordingly
(() => {
  const dispatch = () => window.dispatchEvent(new Event('locationchange'));
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  history.pushState = function (...args: Parameters<History['pushState']>) {
    const ret = push(...args);
    dispatch();
    return ret;
  } as typeof history.pushState;
  history.replaceState = function (...args: Parameters<History['replaceState']>) {
    const ret = replace(...args);
    dispatch();
    return ret;
  } as typeof history.replaceState;
  window.addEventListener('popstate', dispatch);
  window.addEventListener('locationchange', evaluateAndToggleUI);
})();
