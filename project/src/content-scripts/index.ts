import { likeComment, replyToComment, sendDm, sendDmViaProfile } from './domInteractor';
import { mountApp, unmountApp } from '../ui';

import '../index.css';

// Function to load CSS content with fallback mechanisms
const loadCSS = async (): Promise<string> => {
  try {
    // In development, use inline import
    if (import.meta.env.DEV) {
      const cssModule = await import('../index.css?inline');
      return cssModule.default;
    }
    // In production, fetch the built CSS file
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      const response = await fetch(chrome.runtime.getURL('assets/style.css'));
      if (!response.ok) {
        throw new Error(`Failed to fetch CSS: ${response.status}`);
      }
      return await response.text();
    } else {
      // Fallback when Chrome APIs are not available
      console.warn('Chrome extension APIs not available for CSS loading');
      throw new Error('Chrome APIs not available');
    }
  } catch (error) {
    console.error('Failed to load CSS:', error);
    // Enhanced fallback with local font definitions and complete styling
    return `
      /* Fallback font definitions */
      @font-face {
        font-family: 'Inter-Fallback';
        src: local('Inter'), local('system-ui'), local('-apple-system');
        font-weight: 300 900;
        font-style: normal;
        font-display: swap;
      }
      
      @font-face {
        font-family: 'Saira-Fallback';
        src: local('Saira'), local('system-ui'), local('-apple-system');
        font-weight: 100 900;
        font-style: normal;
        font-display: swap;
      }
      
      .sidebar {
        font-family: 'Inter-Fallback', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background: #ffffff;
        color: #111827;
        line-height: 1.5;
      }
      
      .sidebar h1, .sidebar h2, .sidebar h3, .sidebar h4, .sidebar h5, .sidebar h6 {
        font-family: 'Saira-Fallback', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-weight: 600;
        color: #111827;
      }
      
      .sidebar button {
        font-family: inherit;
        background: #3b82f6;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 0.375rem;
        cursor: pointer;
      }
      
      .sidebar button:hover {
        background: #2563eb;
      }
      
      .sidebar input, .sidebar textarea {
        font-family: inherit;
        border: 1px solid #d1d5db;
        border-radius: 0.375rem;
        padding: 0.5rem;
        color: #111827;
      }
    `;
  }
};

// Function to preload fonts for better performance
const preloadFonts = () => {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    const fontUrls = [
      chrome.runtime.getURL('fonts/inter.woff2'),
      chrome.runtime.getURL('fonts/saira.woff2')
    ];
    
    fontUrls.forEach(url => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = url;
      link.as = 'font';
      link.type = 'font/woff2';
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
  }
};

// Preload fonts early
preloadFonts()

console.log('Content script starting...');

// UI layout and scale settings
const SIDEBAR_WIDTH = 400; // optimized width to match new layout constraints
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

// Only set up message listener if Chrome extension APIs are available
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
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
} else {
  console.warn('Chrome extension APIs not available - running in non-extension context');
}

// Inject the UI on supported pages
const injectUI = async () => {
  if (hostEl || document.getElementById('linkedin-engagement-assistant-root')) {
    console.log('Sidebar already present. Skipping injection.');
    ensureToggleButton();
    applyContentShift(sidebarOpen);
    updateToggleButtonPosition();
    return;
  }
  try {
    // Pre-load CSS before creating any UI elements
    const css = await loadCSS();
    
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
    
    const shadowRoot = host.attachShadow({ mode: 'open' });
    
    // Enhanced Shadow DOM isolation and styling overrides
    const shadowDOMOverrides = `
      /* Reset and isolate all styles within shadow DOM */
      :host {
        all: initial;
        display: block;
        contain: layout style paint;
      }
      
      /* Ensure high-contrast text and placeholders within the shadow DOM */
      .sidebar input, .sidebar textarea, .sidebar select { 
        color: #111827 !important; 
        caret-color: #111827; 
        font-family: inherit !important;
      }
      .sidebar input::placeholder, .sidebar textarea::placeholder { 
        color: #111827 !important; 
        opacity: 1 !important; 
      }
      .sidebar input::-webkit-input-placeholder, .sidebar textarea::-webkit-input-placeholder { 
        color: #111827 !important; 
        opacity: 1 !important; 
      }
      .sidebar input::-moz-placeholder, .sidebar textarea::-moz-placeholder { 
        color: #111827 !important; 
        opacity: 1 !important; 
      }
      .sidebar input:-ms-input-placeholder, .sidebar textarea:-ms-input-placeholder { 
        color: #111827 !important; 
        opacity: 1 !important; 
      }
      
      /* Prevent LinkedIn styles from affecting our components */
      .sidebar * {
        box-sizing: border-box !important;
        font-family: inherit !important;
        pointer-events: auto !important;
      }
      
      /* Ensure buttons are clickable */
      .sidebar button {
        pointer-events: auto !important;
        cursor: pointer !important;
        user-select: none !important;
      }
      
      /* Ensure proper font inheritance */
      .sidebar {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
      }
      
      .sidebar h1, .sidebar h2, .sidebar h3, .sidebar h4, .sidebar h5, .sidebar h6 {
        font-family: 'Saira', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
      }
    `;
    
    // Process CSS to use extension URLs for fonts (best-effort)
    const processedCSS = css.replace(
      /url\('?\.?\/assets\/fonts\//g,
      `url('${chrome.runtime?.getURL('fonts/') || './fonts/'}`
    );

    const combinedCSS = `${processedCSS}\n${shadowDOMOverrides}`;

    // Prefer Constructable Stylesheets for Shadow DOM
    try {
      const supportsAdopted = !!(shadowRoot as any).adoptedStyleSheets && typeof CSSStyleSheet !== 'undefined';
      if (supportsAdopted) {
        const sheet = new CSSStyleSheet();
        await sheet.replace(combinedCSS);
        // Replace any existing sheets to avoid duplicates on reinjection
        (shadowRoot as any).adoptedStyleSheets = [sheet];
      } else {
        // Fallback to <style>
        const styleEl = document.createElement('style');
        styleEl.textContent = combinedCSS;
        shadowRoot.appendChild(styleEl);
      }
    } catch (e) {
      // Absolute fallback to <style> if Constructable Stylesheets error
      const styleEl = document.createElement('style');
      styleEl.textContent = combinedCSS;
      shadowRoot.appendChild(styleEl);
    }

    // Wait briefly to ensure initial paint with styles
    await new Promise((resolve) => setTimeout(resolve, 10));
    
    const appRoot = document.createElement('div');
    appRoot.id = 'app-root';
    // Set font scaling for the shadow DOM content (affects rem-based sizes)
    appRoot.style.setProperty('--ui-font-scale', String(UI_FONT_SCALE));
    // Ensure inner sidebar width matches the host width
    appRoot.style.setProperty('--sidebar-width', `${SIDEBAR_WIDTH}px`);
    shadowRoot.appendChild(appRoot);
    
    // Add host to DOM after shadow root is fully prepared
    document.body.appendChild(host);
    
    // Mount app after everything is ready
    mountApp(appRoot);
    hostEl = host;
    appRootEl = appRoot;
    console.log('Mounted sidebar UI with proper CSS timing');

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
const evaluateAndToggleUI = async () => {
  if (isOnLinkedInPost()) {
    await injectUI();
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
