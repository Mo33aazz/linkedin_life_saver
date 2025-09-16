import {
  likeComment,
  replyToComment,
  sendDm,
  sendDmViaProfile,
} from './domInteractor';
import { mountApp, unmountApp } from '../ui';
import shadowDOMOverrides from './sidebar-styles.css?inline';

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
    if (
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      chrome.runtime.getURL
    ) {
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
  if (
    typeof chrome !== 'undefined' &&
    chrome.runtime &&
    chrome.runtime.getURL
  ) {
    const fontUrls = [
      chrome.runtime.getURL('fonts/inter.woff2'),
      chrome.runtime.getURL('fonts/saira.woff2'),
    ];

    fontUrls.forEach((url) => {
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
preloadFonts();

console.log('Content script starting...');

// UI layout and scale settings
// Sidebar width (px) for the injected UI
const SIDEBAR_WIDTH = 420; // keep in sync with --sidebar-width
const UI_FONT_SCALE = 1.5; // scale base font-size (affects Tailwind rem units)
const TRANSITION_DURATION_MS = 260; // smooth slide/shift duration

const isOnLinkedInPost = (): boolean => {
  try {
    const href = window.location.href;
    // Match: https://www.linkedin.com/feed/update/urn:li:activity:123456/
    // Allow optional trailing params or missing trailing slash
    return /^https:\/\/www\.linkedin\.com\/feed\/update\/urn:li:activity:\d+\/?(\?.*)?$/.test(
      href
    );
  } catch {
    return false;
  }
};

let hostEl: HTMLElement | null = null;
let appRootEl: HTMLElement | null = null;
let toggleEl: HTMLButtonElement | null = null;
let layoutStyleEl: HTMLStyleElement | null = null;
let toggleStyleEl: HTMLStyleElement | null = null;
let fixedObserver: MutationObserver | null = null;
let fixedScanScheduled = false;
let sidebarOpen = true; // default open to preserve existing behavior/tests

// ---- Sidebar toggle and page layout shift helpers ----
const ensureToggleStyles = () => {
  if (toggleStyleEl || document.getElementById('lea-toggle-style')) return;
  const style = document.createElement('style');
  style.id = 'lea-toggle-style';
  style.textContent = `
    #lea-toggle {
      --accent: #0a66c2;
      transform: translateY(-50%);
      background: rgba(255,255,255,0.65);
      -webkit-backdrop-filter: blur(8px) saturate(140%);
      backdrop-filter: blur(8px) saturate(140%);
      border: 1px solid rgba(17, 24, 39, 0.08);
      color: rgba(31, 41, 55, 0.9);
      box-shadow: 0 6px 18px rgba(17, 24, 39, 0.12);
    }
    #lea-toggle:hover {
      background: rgba(255,255,255,0.85);
      color: var(--accent);
      box-shadow: 0 8px 24px rgba(17, 24, 39, 0.18);
    }
    #lea-toggle:active { transform: translateY(-50%) scale(0.96); }
    #lea-toggle:focus-visible {
      outline: none;
      box-shadow: 0 0 0 4px rgba(10, 102, 194, 0.18), 0 6px 18px rgba(17, 24, 39, 0.12);
    }
    #lea-toggle svg {
      transform: rotate(var(--icon-rotate, 0deg));
      transition: transform ${TRANSITION_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), color 120ms ease;
      will-change: transform;
    }
    #lea-toggle:hover svg {
      transform: translateX(var(--icon-nudge, 0)) rotate(var(--icon-rotate, 0deg));
    }
    @media (prefers-reduced-motion: reduce) {
      #lea-toggle, #lea-toggle svg { transition: none !important; }
    }
  `;
  document.head.appendChild(style);
  toggleStyleEl = style;
};
const ensureToggleButton = () => {
  if (toggleEl) return;
  ensureToggleStyles();
  const btn = document.createElement('button');
  btn.id = 'lea-toggle';
  Object.assign(btn.style, {
    position: 'fixed',
    top: '50%',
    right: '8px',
    width: '40px',
    height: '40px',
    borderRadius: '9999px',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 6px 18px rgba(17,24,39,0.12)',
    zIndex: '100000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: `right ${TRANSITION_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), background 200ms ease, box-shadow 200ms ease`,
  } as Partial<CSSStyleDeclaration>);
  btn.title = 'Toggle Assistant Sidebar';
  btn.setAttribute('aria-label', 'Toggle Assistant Sidebar');
  btn.setAttribute('aria-controls', 'linkedin-engagement-assistant-root');
  btn.setAttribute('aria-expanded', String(Boolean(sidebarOpen)));

  // Inline SVG chevron for a cleaner icon
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  const path = document.createElementNS(svgNS, 'path');
  // heroicons outline chevron-left
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('d', 'M15.75 19.5L8.25 12l7.5-7.5');
  svg.appendChild(path);
  btn.appendChild(svg);

  const setIconDirection = (open: boolean) => {
    // Open => left chevron (0deg). Closed => right chevron (180deg)
    btn.style.setProperty('--icon-rotate', open ? '0deg' : '180deg');
    btn.style.setProperty('--icon-nudge', open ? '-1px' : '1px');
    btn.setAttribute('aria-expanded', String(Boolean(open)));
    btn.title = open ? 'Hide Assistant Sidebar' : 'Show Assistant Sidebar';
  };
  setIconDirection(sidebarOpen);

  btn.addEventListener('click', () => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (sidebarOpen) {
      // Slide the sidebar off-screen without unmounting
      if (hostEl) {
        hostEl.style.transform = 'translateX(100%)';
        hostEl.style.pointerEvents = 'none';
        hostEl.setAttribute('aria-hidden', 'true');
      }
      removeContentShift();
      stopFixedElementsAdjustment();
      sidebarOpen = false;
    } else {
      if (!hostEl) {
        // If not yet injected (e.g., after navigation), inject first
        void injectUI();
      } else {
        hostEl.style.transform = 'translateX(0)';
        hostEl.style.pointerEvents = 'auto';
        hostEl.removeAttribute('aria-hidden');
      }
      applyContentShift(true);
      setSidebarOffsetVars(true);
      startFixedElementsAdjustment();
      sidebarOpen = true;
    }

    setIconDirection(sidebarOpen);
    updateToggleButtonPosition();

    // If reduced motion is requested, snap positions instantly
    if (reduceMotion) {
      if (toggleEl) toggleEl.style.transition = 'none';
    } else if (toggleEl) {
      toggleEl.style.transition = `right ${TRANSITION_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), background-color 120ms ease`;
    }
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
  const css = `
    body { transition: margin-right ${TRANSITION_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1) !important; }
    body { margin-right: ${SIDEBAR_WIDTH}px !important; overflow-x: hidden !important; }
    @media (prefers-reduced-motion: reduce) {
      body { transition: none !important; }
    }
  `;
  if (!layoutStyleEl) {
    layoutStyleEl = document.createElement('style');
    layoutStyleEl.id = 'lea-layout-style';
    layoutStyleEl.textContent = css;
    document.head.appendChild(layoutStyleEl);
  } else {
    // Update to ensure transitions are applied when re-opening
    layoutStyleEl.textContent = css;
  }
  setSidebarOffsetVars(true);
};

const removeContentShift = () => {
  if (!layoutStyleEl) return;
  // Animate back to 0 margin, then clean up the style tag after the transition
  const css = `
    body { transition: margin-right ${TRANSITION_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1) !important; }
    body { margin-right: 0 !important; overflow-x: hidden !important; }
    @media (prefers-reduced-motion: reduce) {
      body { transition: none !important; }
    }
  `;
  layoutStyleEl.textContent = css;
  const el = layoutStyleEl;
  layoutStyleEl = null;
  window.setTimeout(() => {
    if (el && el.parentElement) {
      try {
        el.parentElement.removeChild(el);
      } catch {
        // ignore
      }
    }
  }, TRANSITION_DURATION_MS + 50);
  setSidebarOffsetVars(false);
};

// Expose a CSS variable and class on :root so site-wide rules and our logic can key off the sidebar width
const setSidebarOffsetVars = (open: boolean) => {
  const root = document.documentElement;
  if (open) {
    root.classList.add('lea-sidebar-open');
    root.style.setProperty('--lea-sidebar-offset', `${SIDEBAR_WIDTH}px`);
  } else {
    root.classList.remove('lea-sidebar-open');
    root.style.removeProperty('--lea-sidebar-offset');
  }
};

const RIGHT_ORIG_ATTR = 'data-lea-right-orig';
const ADJUSTED_ATTR = 'data-lea-adjusted';

const adjustFixedRightElement = (el: HTMLElement) => {
  if (el === hostEl || el === toggleEl) return;
  if (el.closest('#linkedin-engagement-assistant-root')) return;
  const cs = getComputedStyle(el);
  if (cs.position !== 'fixed') return;
  if (cs.right === 'auto') return;
  // Ignore elements that already have a large right offset
  const rightPx = parseFloat(cs.right);
  if (!isFinite(rightPx)) return;
  // Skip if already adjusted
  if (el.hasAttribute(ADJUSTED_ATTR)) return;
  // Heuristic: only adjust items that are close to the right edge (<= 48px)
  if (rightPx > 48) return;
  el.setAttribute(RIGHT_ORIG_ATTR, cs.right);
  el.setAttribute(ADJUSTED_ATTR, '1');
  const newRight = rightPx + SIDEBAR_WIDTH;
  el.style.right = `${newRight}px`;
};

const scanAndAdjustFixedElements = () => {
  fixedScanScheduled = false;
  try {
    // Broad but safe: iterate over current subtree once per scan
    const all = document.body.querySelectorAll<HTMLElement>('*');
    for (const el of all) {
      adjustFixedRightElement(el);
    }
  } catch {
    // no-op
  }
};

const scheduleScan = () => {
  if (fixedScanScheduled) return;
  fixedScanScheduled = true;
  requestAnimationFrame(scanAndAdjustFixedElements);
};

const startFixedElementsAdjustment = () => {
  // Initial full scan when opening
  scheduleScan();
  if (fixedObserver) fixedObserver.disconnect();
  fixedObserver = new MutationObserver(() => scheduleScan());
  fixedObserver.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleScan, { passive: true });
};

const stopFixedElementsAdjustment = () => {
  try {
    if (fixedObserver) fixedObserver.disconnect();
  } catch {}
  fixedObserver = null;
  fixedScanScheduled = false;
  window.removeEventListener('resize', scheduleScan);
  // Restore all right offsets we modified
  const adjusted = document.querySelectorAll<HTMLElement>(`[${ADJUSTED_ATTR}]`);
  adjusted.forEach((el) => {
    const orig = el.getAttribute(RIGHT_ORIG_ATTR);
    if (orig !== null) {
      el.style.right = orig;
    } else {
      el.style.removeProperty('right');
    }
    el.removeAttribute(RIGHT_ORIG_ATTR);
    el.removeAttribute(ADJUSTED_ATTR);
  });
};

// Only set up message listener if Chrome extension APIs are available
if (
  typeof chrome !== 'undefined' &&
  chrome.runtime &&
  chrome.runtime.onMessage
) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log('[Content Script] Message received:', message.type);

    // DOM actions are handled here.
    // STATE_UPDATE and LOG_ENTRY are handled by the listener in App.tsx
    // to ensure they are tied to the UI lifecycle.

    if (message.type === 'LIKE_COMMENT') {
      console.log('Content script received LIKE_COMMENT:', message.payload);
      likeComment(message.payload.commentId)
        .then((success) =>
          sendResponse({ status: 'success', payload: success })
        )
        .catch((error) =>
          sendResponse({ status: 'error', message: error.message })
        );
      return true; // Indicates async response
    }

    if (message.type === 'REPLY_TO_COMMENT') {
      console.log('Content script received REPLY_TO_COMMENT:', message.payload);
      replyToComment(message.payload.commentId, message.payload.replyText)
        .then((success) =>
          sendResponse({ status: 'success', payload: success })
        )
        .catch((error) =>
          sendResponse({ status: 'error', message: error.message })
        );
      return true; // Indicates async response
    }

    if (message.type === 'SEND_DM') {
      console.log('Content script received SEND_DM:', message.payload);
      sendDm(message.payload.dmText)
        .then((success) =>
          sendResponse({ status: 'success', payload: success })
        )
        .catch((error) =>
          sendResponse({ status: 'error', message: error.message })
        );
      return true; // Indicates async response
    }

    if (message.type === 'SEND_DM_VIA_PROFILE') {
      console.log(
        'Content script received SEND_DM_VIA_PROFILE:',
        message.payload
      );
      sendDmViaProfile(message.payload.dmText)
        .then((success) =>
          sendResponse({ status: 'success', payload: success })
        )
        .catch((error) =>
          sendResponse({ status: 'error', message: error.message })
        );
      return true; // Indicates async response
    }

    if (message.type === 'CAPTURE_POST_STATE') {
      console.log('Content script received CAPTURE_POST_STATE');
      (async () => {
        try {
          const mod = await import('./domInteractor');
          const payload =
            (message.payload as { noScroll?: boolean; maxComments?: number }) ||
            {};
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
  console.warn(
    'Chrome extension APIs not available - running in non-extension context'
  );
}

// Inject the UI on supported pages
const injectUI = async () => {
  if (hostEl || document.getElementById('linkedin-engagement-assistant-root')) {
    console.log('Sidebar already present. Skipping injection.');
    ensureToggleButton();
    applyContentShift(sidebarOpen);
    updateToggleButtonPosition();
    if (sidebarOpen) {
      setSidebarOffsetVars(true);
      startFixedElementsAdjustment();
    }
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
      transform: 'translateX(0)',
      transition: `transform ${TRANSITION_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      willChange: 'transform',
    } as Partial<CSSStyleDeclaration>);

    const shadowRoot = host.attachShadow({ mode: 'open' });

    // Enhanced Shadow DOM isolation and styling overrides

    // Process CSS to use extension URLs for fonts (best-effort)
    const processedCSS = css.replace(
      /url\('?\.?\/assets\/fonts\//g,
      `url('${chrome.runtime?.getURL('fonts/') || './fonts/'}`
    );

    const combinedCSS = `${processedCSS}\n${shadowDOMOverrides}`;

    // Prefer Constructable Stylesheets for Shadow DOM
    try {
      const supportsAdopted =
        !!(shadowRoot as any).adoptedStyleSheets &&
        typeof CSSStyleSheet !== 'undefined';
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
    // Reflect current open/closed state visually
    if (!sidebarOpen) {
      hostEl.style.transform = 'translateX(100%)';
      hostEl.style.pointerEvents = 'none';
      hostEl.setAttribute('aria-hidden', 'true');
    }
    console.log('Mounted sidebar UI with proper CSS timing');

    ensureToggleButton();
    applyContentShift(sidebarOpen);
    updateToggleButtonPosition();
    if (sidebarOpen) {
      setSidebarOffsetVars(true);
      startFixedElementsAdjustment();
    } else {
      setSidebarOffsetVars(false);
      stopFixedElementsAdjustment();
    }
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
  const existing = document.getElementById(
    'linkedin-engagement-assistant-root'
  );
  if (existing && existing.parentElement) {
    existing.parentElement.removeChild(existing);
  }
  hostEl = null;
  appRootEl = null;
  console.log('Sidebar UI removed');

  // Also remove toggle and layout shift when not on a post page
  if (toggleEl && toggleEl.parentElement)
    toggleEl.parentElement.removeChild(toggleEl);
  toggleEl = null;
  removeContentShift();
  setSidebarOffsetVars(false);
  stopFixedElementsAdjustment();
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
  history.replaceState = function (
    ...args: Parameters<History['replaceState']>
  ) {
    const ret = replace(...args);
    dispatch();
    return ret;
  } as typeof history.replaceState;
  window.addEventListener('popstate', dispatch);
  window.addEventListener('locationchange', evaluateAndToggleUI);
})();
