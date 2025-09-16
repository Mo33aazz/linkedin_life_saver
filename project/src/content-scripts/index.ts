import {
  likeComment,
  replyToComment,
  sendDm,
  sendDmViaProfile,
} from './domInteractor';
import { mountApp, unmountApp } from '../ui';
import shadowDOMOverrides from './sidebar-styles.css?inline';
import type { RunState, UIState } from '../shared/types';

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

let unloadStopHandlerRegistered = false;
let botOverlayEl: HTMLDivElement | null = null;
let botPauseButtonEl: HTMLButtonElement | null = null;
let botOverlayObserver: MutationObserver | null = null;
let currentPipelineStatus: RunState = 'idle';

const updateBotOverlayAccessibility = () => {
  const running = document.documentElement.classList.contains('lea-bot-running');
  if (botOverlayEl) {
    botOverlayEl.setAttribute('aria-hidden', String(!running));
  }
  if (botPauseButtonEl) {
    botPauseButtonEl.tabIndex = running ? 0 : -1;
  }
};

const applyPipelineStatusClass = (status: RunState | undefined) => {
  if (!status) return;
  const hasChanged = status !== currentPipelineStatus;
  currentPipelineStatus = status;
  if (status === 'running') {
    ensureLayoutShiftStyle();
  }
  if (hasChanged) {
    document.documentElement.classList.toggle('lea-bot-running', status === 'running');
  } else if (status === 'running') {
    document.documentElement.classList.add('lea-bot-running');
  } else {
    document.documentElement.classList.remove('lea-bot-running');
  }
  updateBotOverlayAccessibility();
};

const requestPipelineStop = (reason: 'page-unload' | 'overlay-pause' = 'page-unload') => {
  if (reason === 'overlay-pause' && botPauseButtonEl && !botPauseButtonEl.disabled) {
    botPauseButtonEl.disabled = true;
    window.setTimeout(() => {
      if (botPauseButtonEl) {
        botPauseButtonEl.disabled = false;
      }
    }, 1200);
  }
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  try {
    chrome.runtime.sendMessage(
      { type: 'STOP_PIPELINE', payload: { reason } },
      () => {
        const err = chrome.runtime?.lastError;
        const errMessage = typeof err?.message === 'string' ? err.message : '';
        const isContextInvalid = /Extension context invalidated/i.test(errMessage);
        if (err &&
          !/The message port closed before a response was received/i.test(errMessage) &&
          !isContextInvalid
        ) {
          console.warn('STOP_PIPELINE message error:', err);
        }
      }
    );
  } catch (error) {
    const message = (error as Error | undefined)?.message || '';
    if (/Extension context invalidated/i.test(message)) {
      return; // Ignore expected error when the extension is unloading.
    }
    console.warn('Failed to request STOP_PIPELINE on unload:', error);
  }
};

const ensureUnloadStopHandler = () => {
  if (unloadStopHandlerRegistered) return;
  const handler = () => requestPipelineStop('page-unload');
  // Only rely on unload events so the pipeline keeps running when the tab is
  // merely hidden (for example while a profile opens in a new tab).
  window.addEventListener('beforeunload', handler, { capture: false });
  window.addEventListener('unload', handler, { capture: false });
  unloadStopHandlerRegistered = true;
};

ensureUnloadStopHandler();

const ensureBotControlOverlay = () => {
  const setup = () => {
    if (botOverlayEl && botOverlayEl.isConnected) {
      updateBotOverlayAccessibility();
      return;
    }
    const existing = document.getElementById('lea-bot-overlay');
    if (existing) {
      botOverlayEl = existing as HTMLDivElement;
      botPauseButtonEl = botOverlayEl.querySelector('button') as HTMLButtonElement | null;
      updateBotOverlayAccessibility();
      if (!botOverlayObserver) {
        botOverlayObserver = new MutationObserver(() => updateBotOverlayAccessibility());
        botOverlayObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class'],
        });
      }
      return;
    }

    if (!document.body) return;

    const overlay = document.createElement('div');
    overlay.id = 'lea-bot-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        event.stopPropagation();
        event.preventDefault();
      }
    });
    overlay.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
      },
      { passive: false }
    );
    overlay.addEventListener(
      'touchmove',
      (event) => {
        event.preventDefault();
      },
      { passive: false }
    );

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'lea-bot-pause-button';
    button.setAttribute('aria-live', 'polite');
    button.setAttribute('aria-label', 'Pause automation');
    button.innerHTML = `
      <span class="lea-bot-pause-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
          <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
        </svg>
      </span>
      <span class="lea-bot-pause-text">Pause Bot</span>
    `;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      requestPipelineStop('overlay-pause');
    });

    overlay.appendChild(button);
    document.body.appendChild(overlay);

    botOverlayEl = overlay;
    botPauseButtonEl = button;
    updateBotOverlayAccessibility();
    if (!botOverlayObserver) {
      botOverlayObserver = new MutationObserver(() => updateBotOverlayAccessibility());
      botOverlayObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }
  };

  if (document.body) {
    setup();
  } else {
    window.addEventListener('DOMContentLoaded', setup, { once: true });
  }
};

ensureBotControlOverlay();

let pipelineStatusInitAttempts = 0;
const MAX_PIPELINE_STATUS_ATTEMPTS = 6;

const requestInitialPipelineStatus = () => {
  if (pipelineStatusInitAttempts >= MAX_PIPELINE_STATUS_ATTEMPTS) {
    return;
  }
  pipelineStatusInitAttempts += 1;
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  try {
    chrome.runtime.sendMessage(
      { type: 'GET_PIPELINE_STATUS' },
      (response?: { status?: string; payload?: RunState }) => {
        const err = chrome.runtime?.lastError;
        const errMessage = typeof err?.message === 'string' ? err.message : '';
        if (
          err &&
          !/The message port closed before a response was received/i.test(errMessage)
        ) {
          console.warn('GET_PIPELINE_STATUS message error:', err);
          return;
        }
        if (err && pipelineStatusInitAttempts < MAX_PIPELINE_STATUS_ATTEMPTS) {
          const backoffMs = pipelineStatusInitAttempts * 200;
          window.setTimeout(requestInitialPipelineStatus, backoffMs);
          return;
        }
        if (response?.status === 'success' && response.payload) {
          applyPipelineStatusClass(response.payload);
          pipelineStatusInitAttempts = MAX_PIPELINE_STATUS_ATTEMPTS;
        } else if (pipelineStatusInitAttempts < MAX_PIPELINE_STATUS_ATTEMPTS) {
          const backoffMs = pipelineStatusInitAttempts * 200;
          window.setTimeout(requestInitialPipelineStatus, backoffMs);
        }
      }
    );
  } catch (error) {
    console.warn('Failed to request current pipeline status:', error);
  }
};

requestInitialPipelineStatus();

// UI layout and scale settings
// Sidebar width (px) for the injected UI
const SIDEBAR_WIDTH = 420; // keep in sync with --sidebar-width
const UI_FONT_SCALE = 1.5; // scale base font-size (affects Tailwind rem units)
const TRANSITION_DURATION_MS = 260; // smooth slide/shift duration
const MIN_SIDEBAR_WIDTH = 280;
const SIDEBAR_WIDTH_RATIO = 0.32;
const MIN_CONTENT_FALLBACK = 360;
const DEFAULT_VIEWPORT_META =
  'width=device-width, initial-scale=1, viewport-fit=cover';

const computeSidebarWidth = (viewportWidth: number): number => {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return SIDEBAR_WIDTH;
  }

  const ratioWidth = Math.round(viewportWidth * SIDEBAR_WIDTH_RATIO);
  const maxWidth = SIDEBAR_WIDTH;
  const minWidth = MIN_SIDEBAR_WIDTH;
  let width = Math.max(minWidth, Math.min(maxWidth, ratioWidth));

  const maxAllowed = Math.max(
    minWidth,
    Math.floor(viewportWidth - MIN_CONTENT_FALLBACK)
  );

  width = Math.min(width, maxAllowed);
  width = Math.min(width, Math.max(minWidth, Math.floor(viewportWidth * 0.6)));

  return Math.max(minWidth, Math.min(maxWidth, width));
};

const initialViewportWidth =
  window.innerWidth || document.documentElement.clientWidth || SIDEBAR_WIDTH;
let currentSidebarWidth = computeSidebarWidth(initialViewportWidth);

let viewportMetaEl: HTMLMetaElement | null = null;
let viewportMetaOriginalContent: string | null = null;
let viewportMetaCreated = false;

const ensureViewportMetaEl = (): HTMLMetaElement | null => {
  if (viewportMetaEl && viewportMetaEl.isConnected) {
    return viewportMetaEl;
  }

  const existing = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (existing) {
    viewportMetaEl = existing;
    viewportMetaCreated = false;
    return existing;
  }

  const meta = document.createElement('meta');
  meta.name = 'viewport';
  meta.content = DEFAULT_VIEWPORT_META;
  document.head.appendChild(meta);
  viewportMetaEl = meta;
  viewportMetaCreated = true;
  return meta;
};

const applyViewportCondensedState = (contentWidth: number) => {
  const meta = ensureViewportMetaEl();
  if (!meta) return;

  if (viewportMetaOriginalContent === null) {
    viewportMetaOriginalContent = meta.getAttribute('content');
  }

  const width = Math.max(1, Math.round(contentWidth));
  meta.setAttribute(
    'content',
    `width=${width}, initial-scale=1, maximum-scale=1, viewport-fit=cover`
  );

  const rootEl = document.documentElement;
  rootEl.classList.add('lea-viewport-condensed');
  rootEl.style.setProperty('--lea-viewport-width', `${width}px`);
};

const resetViewportMetaState = () => {
  if (!viewportMetaEl) return;

  const rootEl = document.documentElement;
  if (viewportMetaOriginalContent !== null) {
    viewportMetaEl.setAttribute('content', viewportMetaOriginalContent);
  } else {
    viewportMetaEl.setAttribute('content', DEFAULT_VIEWPORT_META);
  }

  if (viewportMetaCreated && !viewportMetaEl.getAttribute('content')) {
    viewportMetaEl.setAttribute('content', DEFAULT_VIEWPORT_META);
  }

  rootEl.classList.remove('lea-viewport-condensed');
  rootEl.style.removeProperty('--lea-viewport-width');
};

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

const syncToggleVisualState = (open: boolean) => {
  if (!toggleEl) return;
  toggleEl.style.setProperty('--icon-rotate', open ? '0deg' : '180deg');
  toggleEl.style.setProperty('--icon-nudge', open ? '-1px' : '1px');
  toggleEl.setAttribute('aria-expanded', String(Boolean(open)));
  toggleEl.title = open ? 'Hide Assistant Sidebar' : 'Show Assistant Sidebar';
};
let layoutShiftEnabled = false;
let responsiveLayoutRaf: number | null = null;
let responsiveLayoutStyleEl: HTMLStyleElement | null = null;
let lastKnownHref = window.location.href;
let evaluateInFlight = false;
let locationCheckTimer: number | null = null;
const LOCATION_CHECK_INTERVAL_MS = 450;

// ---- Sidebar toggle and page layout shift helpers ----
const ensureLayoutShiftStyle = (): boolean => {
  if (layoutStyleEl && layoutStyleEl.isConnected) {
    return false;
  }

  const style = layoutStyleEl ?? document.createElement('style');
  style.id = 'lea-layout-style';
  style.textContent = `
    body {
      transition: margin-right ${TRANSITION_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1) !important;
      margin-right: var(--lea-sidebar-shift, 0px) !important;
      overflow-x: hidden !important;
    }
    @keyframes lea-bot-control-pulse {
      0%, 100% {
        opacity: 0.7;
        box-shadow:
          inset 0 0 0 1px rgba(59, 130, 246, 0.85),
          inset 0 0 60px rgba(59, 130, 246, 0.78),
          inset 0 0 120px rgba(37, 99, 235, 0.6);
      }
      45% {
        opacity: 1;
        box-shadow:
          inset 0 0 0 2px rgba(59, 130, 246, 1),
          inset 0 0 120px rgba(59, 130, 246, 0.95),
          inset 0 0 200px rgba(37, 99, 235, 0.9);
      }
    }
    body::after {
      content: '';
      position: fixed;
      inset: 0;
      right: var(--lea-sidebar-offset, 0px);
      pointer-events: none;
      opacity: 0;
      z-index: 2147480000;
      transition: opacity ${TRANSITION_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1);
      background:
        radial-gradient(120% 120% at 50% 50%, rgba(59, 130, 246, 0) 58%, rgba(37, 99, 235, 0.9) 90%, rgba(59, 130, 246, 0.95) 100%);
      box-shadow:
        inset 0 0 0 1px rgba(59, 130, 246, 0.9),
        inset 0 0 40px rgba(59, 130, 246, 0.85);
    }
    html.lea-sidebar-open body::after {
      opacity: 1;
    }
    html.lea-bot-running body::after {
      opacity: 1;
      background:
        radial-gradient(140% 140% at 50% 50%, rgba(59, 130, 246, 0.05) 45%, rgba(37, 99, 235, 0.95) 86%, rgba(14, 67, 177, 0.98) 100%);
      box-shadow:
        inset 0 0 0 3px rgba(59, 130, 246, 1),
        inset 0 0 160px rgba(37, 99, 235, 0.95),
        inset 0 0 320px rgba(12, 74, 165, 0.92);
      animation: lea-bot-control-pulse 0.7s ease-in-out infinite;
    }
    #lea-bot-overlay {
      position: fixed;
      inset: 0;
      right: var(--lea-sidebar-offset, 0px);
      z-index: 2147480001;
      display: none;
      pointer-events: none;
      align-items: flex-end;
      justify-content: center;
      padding: 0 0 clamp(40px, 8vh, 96px);
      background: transparent;
      backdrop-filter: none;
    }
    html.lea-bot-running #lea-bot-overlay {
      display: flex;
      pointer-events: auto;
      cursor: not-allowed;
    }
    #lea-bot-overlay button {
      pointer-events: auto;
      border: none;
      border-radius: 999px;
      padding: 0.85rem 2.7rem;
      font-size: 1rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: #f8fafc;
      box-shadow:
        0 22px 45px rgba(37, 99, 235, 0.36),
        0 10px 24px rgba(15, 23, 42, 0.28);
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
        box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1),
        background 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;
    }
    #lea-bot-overlay button:hover {
      transform: translateY(-2px) scale(1.01);
      box-shadow:
        0 28px 55px rgba(37, 99, 235, 0.42),
        0 12px 28px rgba(15, 23, 42, 0.32);
      background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
    }
    #lea-bot-overlay button:active {
      transform: translateY(0) scale(0.99);
      box-shadow:
        0 12px 32px rgba(30, 64, 175, 0.38),
        0 6px 18px rgba(15, 23, 42, 0.3);
    }
    #lea-bot-overlay button:disabled {
      opacity: 0.7;
      cursor: progress;
    }
    #lea-bot-overlay button svg {
      width: 20px;
      height: 20px;
    }
    #lea-bot-overlay button .lea-bot-pause-icon {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.16);
      box-shadow: inset 0 0 0 1px rgba(248, 250, 252, 0.15);
    }
    #lea-bot-overlay button .lea-bot-pause-text {
      font-size: 1.05rem;
      line-height: 1.2;
      white-space: nowrap;
    }
    html.lea-bot-running,
    html.lea-bot-running body {
      overflow: hidden !important;
      overscroll-behavior: none !important;
    }
    @media (prefers-reduced-motion: reduce) {
      body { transition: none !important; }
      body::after { transition: none !important; }
      html.lea-bot-running body::after { animation: none; }
      #lea-bot-overlay button { transition: none !important; }
    }
  `;

  if (!style.isConnected) {
    document.head.appendChild(style);
  }

  layoutStyleEl = style;
  return true;
};

const applyContentShift = (width: number = currentSidebarWidth) => {
  const margin = Math.max(0, Math.round(width));
  const styleCreated = ensureLayoutShiftStyle();
  const root = document.documentElement;

  if (styleCreated) {
    // Ensure browsers register the starting point for the transition when
    // the style tag is first inserted.
    root.style.setProperty('--lea-sidebar-shift', '0px');
    requestAnimationFrame(() => {
      root.style.setProperty('--lea-sidebar-shift', `${margin}px`);
    });
  } else {
    root.style.setProperty('--lea-sidebar-shift', `${margin}px`);
  }
};

const removeContentShift = () => {
  if (!layoutStyleEl) return;
  const root = document.documentElement;
  root.style.setProperty('--lea-sidebar-shift', '0px');
  const el = layoutStyleEl;
  window.setTimeout(() => {
    if (el && el.parentElement) {
      try {
        el.parentElement.removeChild(el);
      } catch {
        // ignore errors removing stale style tag
      }
    }
    if (layoutStyleEl === el) {
      layoutStyleEl = null;
    }
    root.style.removeProperty('--lea-sidebar-shift');
  }, TRANSITION_DURATION_MS + 50);
  setSidebarOffsetVars(false);
};

const setSidebarOffsetVars = (open: boolean, width: number = currentSidebarWidth) => {
  const root = document.documentElement;
  if (open) {
    root.classList.add('lea-sidebar-open');
    root.style.setProperty('--lea-sidebar-offset', `${width}px`);
  } else {
    root.classList.remove('lea-sidebar-open');
    root.style.removeProperty('--lea-sidebar-offset');
  }
};

const ensureResponsiveStyle = () => {
  if (responsiveLayoutStyleEl) return;
  const style = document.createElement('style');
  style.id = 'lea-layout-responsive-style';
  style.textContent = `
    html.lea-viewport-condensed body,
    html.lea-viewport-condensed #main,
    html.lea-viewport-condensed .application-outlet,
    html.lea-viewport-condensed .app-outlet,
    html.lea-viewport-condensed .scaffold-layout,
    html.lea-viewport-condensed .scaffold-layout__container,
    html.lea-viewport-condensed .scaffold-layout__content {
      max-width: var(--lea-viewport-width, calc(100vw - var(--lea-sidebar-offset, 0px))) !important;
      width: auto !important;
      min-width: 0 !important;
    }

    html.lea-viewport-condensed .global-nav__content,
    html.lea-viewport-condensed .msg-overlay-list-bubble,
    html.lea-viewport-condensed .msg-overlay-list-bubble--expanded,
    html.lea-viewport-condensed .artdeco-toasts_toast-container {
      max-width: calc(var(--lea-viewport-width, 100vw) - 16px) !important;
    }
  `;
  document.head.appendChild(style);
  responsiveLayoutStyleEl = style;
};

const updateToggleButtonPosition = () => {
  if (!toggleEl) return;
  const offset = sidebarOpen ? currentSidebarWidth + 8 : 8;
  toggleEl.style.right = `${offset}px`;
};

const animateSidebarOpen = () => {
  if (!hostEl) return;
  const reduceMotion = Boolean(
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );

  hostEl.style.pointerEvents = 'none';
  hostEl.setAttribute('aria-hidden', 'true');
  hostEl.style.transform = 'translateX(100%)';

  const finalize = () => {
    if (!hostEl) return;
    hostEl.style.transform = 'translateX(0)';
    hostEl.style.pointerEvents = 'auto';
    hostEl.removeAttribute('aria-hidden');
    updateToggleButtonPosition();
  };

  if (reduceMotion) {
    finalize();
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(finalize);
  });
};

const updateResponsiveLayout = () => {
  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || SIDEBAR_WIDTH;
  const nextWidth = computeSidebarWidth(viewportWidth);
  const widthChanged = nextWidth !== currentSidebarWidth;
  currentSidebarWidth = nextWidth;

  if (hostEl) {
    hostEl.style.width = `${nextWidth}px`;
  }

  if (appRootEl) {
    appRootEl.style.setProperty('--sidebar-width', `${nextWidth}px`);
  }

  document.documentElement.style.setProperty(
    '--lea-sidebar-width',
    `${nextWidth}px`
  );

  if (sidebarOpen && layoutShiftEnabled) {
    ensureResponsiveStyle();
    applyContentShift(nextWidth);
    setSidebarOffsetVars(true, nextWidth);
    const availableWidth = Math.max(1, Math.round(viewportWidth - nextWidth));
    applyViewportCondensedState(availableWidth);
    if (widthChanged) {
      scheduleScan();
    }
  } else {
    removeContentShift();
    setSidebarOffsetVars(false, nextWidth);
    resetViewportMetaState();
  }

  updateToggleButtonPosition();
};

const scheduleResponsiveLayout = () => {
  if (responsiveLayoutRaf !== null) return;
  responsiveLayoutRaf = requestAnimationFrame(() => {
    responsiveLayoutRaf = null;
    updateResponsiveLayout();
  });
};

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

  toggleEl = btn;
  syncToggleVisualState(sidebarOpen);

  btn.addEventListener('click', () => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (sidebarOpen) {
      // Slide the sidebar off-screen without unmounting
      if (hostEl) {
        hostEl.style.transform = 'translateX(100%)';
        hostEl.style.pointerEvents = 'none';
        hostEl.setAttribute('aria-hidden', 'true');
      }
      sidebarOpen = false;
      layoutShiftEnabled = false;
      updateResponsiveLayout();
      stopFixedElementsAdjustment();
    } else {
      if (!hostEl) {
        // If not yet injected (e.g., after navigation), inject first
        void injectUI();
      } else {
        hostEl.style.transform = 'translateX(0)';
        hostEl.style.pointerEvents = 'auto';
        hostEl.removeAttribute('aria-hidden');
      }
      sidebarOpen = true;
      layoutShiftEnabled = true;
      updateResponsiveLayout();
      startFixedElementsAdjustment();
    }

    syncToggleVisualState(sidebarOpen);

    // If reduced motion is requested, snap positions instantly
    if (reduceMotion) {
      if (toggleEl) toggleEl.style.transition = 'none';
    } else if (toggleEl) {
      toggleEl.style.transition = `right ${TRANSITION_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), background-color 120ms ease`;
    }
  });
  document.body.appendChild(btn);
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
  const newRight = rightPx + currentSidebarWidth;
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
    // UI components still listen for STATE_UPDATE, but we also tap the
    // pipeline status to keep global overlays in sync across tabs.

    if (message.type === 'STATE_UPDATE' && message.payload) {
      const payload = message.payload as Partial<UIState>;
      if (payload.pipelineStatus) {
        applyPipelineStatusClass(payload.pipelineStatus);
      }
      return;
    }

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

window.addEventListener('resize', scheduleResponsiveLayout, { passive: true });
window.addEventListener('orientationchange', scheduleResponsiveLayout, {
  passive: true,
});
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', scheduleResponsiveLayout);
}

// Inject the UI on supported pages
const injectUI = async () => {
  if (hostEl || document.getElementById('linkedin-engagement-assistant-root')) {
    console.log('Sidebar already present. Skipping injection.');
    ensureToggleButton();
    layoutShiftEnabled = sidebarOpen;
    updateResponsiveLayout();
    syncToggleVisualState(sidebarOpen);
    if (sidebarOpen) {
      startFixedElementsAdjustment();
    }
    return;
  }
  try {
    // Pre-load CSS before creating any UI elements
    const css = await loadCSS();

    const initialWidth = computeSidebarWidth(
      window.innerWidth || document.documentElement.clientWidth || SIDEBAR_WIDTH
    );
    currentSidebarWidth = initialWidth;

    const host = document.createElement('div');
    host.id = 'linkedin-engagement-assistant-root';
    host.className = 'sidebar';
    Object.assign(host.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      padding: '0',
      width: `${initialWidth}px`,
      height: '100vh',
      zIndex: '99999',
      borderLeft: '1px solid #e0e0e0',
      boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
      backgroundColor: '#fff',
      transform: 'translateX(100%)',
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
    appRoot.style.setProperty('--sidebar-width', `${initialWidth}px`);
    shadowRoot.appendChild(appRoot);

    // Add host to DOM after shadow root is fully prepared
    document.body.appendChild(host);

    // Mount app after everything is ready
    mountApp(appRoot);
    hostEl = host;
    appRootEl = appRoot;
    console.log('Mounted sidebar UI with proper CSS timing');

    ensureToggleButton();
    syncToggleVisualState(sidebarOpen);
    layoutShiftEnabled = sidebarOpen;
    updateResponsiveLayout();
    if (sidebarOpen) {
      animateSidebarOpen();
      startFixedElementsAdjustment();
    } else {
      if (hostEl) {
        hostEl.style.pointerEvents = 'none';
        hostEl.setAttribute('aria-hidden', 'true');
      }
      stopFixedElementsAdjustment();
    }
  } catch (error) {
    console.error('Failed to inject UI:', error);
  }
};

// Remove the UI when not on supported pages
const removeUI = async (options: { animate?: boolean } = {}) => {
  const reopenOnNextPost = sidebarOpen;
  const reduceMotion = Boolean(
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
  const shouldAnimate = Boolean(options.animate) && Boolean(hostEl) && !reduceMotion;

  if (hostEl) {
    sidebarOpen = false;
    syncToggleVisualState(false);
  }

  layoutShiftEnabled = false;
  updateResponsiveLayout();

  if (shouldAnimate && hostEl) {
    hostEl.style.transform = 'translateX(100%)';
    hostEl.style.pointerEvents = 'none';
    hostEl.setAttribute('aria-hidden', 'true');
    updateToggleButtonPosition();
    await new Promise((resolve) =>
      window.setTimeout(resolve, TRANSITION_DURATION_MS + 80)
    );
  }

  stopFixedElementsAdjustment();

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

  if (toggleEl && toggleEl.parentElement) {
    toggleEl.parentElement.removeChild(toggleEl);
  }
  toggleEl = null;
  sidebarOpen = reopenOnNextPost;
};

// Decide whether to show or hide the UI based on URL
const evaluateAndToggleUI = async () => {
  if (evaluateInFlight) return;
  evaluateInFlight = true;
  lastKnownHref = window.location.href;
  try {
    if (isOnLinkedInPost()) {
      await injectUI();
    } else {
      await removeUI({ animate: true });
    }
  } catch (error) {
    console.error('Failed to evaluate sidebar state:', error);
  } finally {
    evaluateInFlight = false;
  }
};

const startLocationWatcher = () => {
  if (locationCheckTimer !== null) return;
  locationCheckTimer = window.setInterval(() => {
    const href = window.location.href;
    if (href !== lastKnownHref) {
      lastKnownHref = href;
      void evaluateAndToggleUI();
    }
  }, LOCATION_CHECK_INTERVAL_MS);
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

startLocationWatcher();
