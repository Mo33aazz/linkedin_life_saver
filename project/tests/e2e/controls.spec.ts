import { test, expect } from '@playwright/test';
import type { PostState, LogEntry, UIState } from '../../src/shared/types';

// --- START: Reusable E2E helpers for interacting with the shared browser server ---

const SERVER_PORT = Number(process.env.SHARED_BROWSER_PORT || 9333);
const BASE = `http://localhost:${SERVER_PORT}`;
const STATUS_URL = `${BASE}/api/status`;
const ACTION_URL = `${BASE}/api/action`;

async function serverUp() {
  const res = await fetch(STATUS_URL).catch(() => null);
  if (!res || !res.ok) return false;
  const body = await res.json().catch(() => null);
  return Boolean(body?.ok);
}

async function action(payload: Record<string, unknown>) {
  const res = await fetch(ACTION_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    throw new Error(`Action failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.result;
}

async function newTestPageId(retries = 8, delayMs = 300): Promise<string> {
  for (let i = 0; i < retries; i += 1) {
    try {
      const np = await action({ action: 'newPage' });
      const pageId = np?.pageId as string | undefined;
      if (pageId) return pageId;
    } catch {}
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return '';
}

async function isSelectorVisibleInShadowDom(pageId: string, selector: string) {
  const res = await action({
    action: 'evaluate',
    pageId,
    expression: `
      (() => {
        const host = document.getElementById('linkedin-engagement-assistant-root');
        const root = host && host.shadowRoot;
        if (!root) return false;
        const el = root.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
      })()
    `,
  }).catch(() => ({ result: false }));
  return res === true || res === 'true';
}


async function waitForSelectorEval(
  pageId: string,
  selector: string,
  timeoutMs = 12_000
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const sel = ${JSON.stringify(selector)};
        const el = document.querySelector(sel);
        if (!el) return false;
        const style = window.getComputedStyle(el);
        const isVisible = style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
        return !!isVisible;
      `,
    }).catch(() => ({ result: false }));
    if (res && (res.result === true || res.result === 'true')) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timeout waiting for selector: ${selector}`);
}

// NEW helper to wait for specific text content, aware of shadow DOM
async function waitForSelectorText(
  pageId: string,
  selector: string,
  expectedText: string,
  timeoutMs = 12_000
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await action({
      action: 'evaluate',
      pageId,
      expression: `
        (() => {
          const host = document.getElementById('linkedin-engagement-assistant-root');
          const root = host && host.shadowRoot;
          return root ? root.querySelector(${JSON.stringify(selector)})?.textContent : null;
        })()
      `,
    }).catch(() => ({ result: null }));
    if (res && res.result === expectedText) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  const { result: actualText } = await action({
    action: 'evaluate',
    pageId,
    expression: `
      (() => {
        const host = document.getElementById('linkedin-engagement-assistant-root');
        const root = host && host.shadowRoot;
        return root ? root.querySelector(${JSON.stringify(selector)})?.textContent : 'Element not found';
      })()
    `,
  });
  throw new Error(`Timeout waiting for selector ${selector} to have text "${expectedText}". Found "${actualText}" instead.`);
}


// --- END: Reusable E2E helpers ---

// --- Test-specific helpers for state injection ---

async function evaluateOnServiceWorker(expression: string) {
  return action({ action: 'evaluateOnServiceWorker', expression });
}

async function injectPostState(postUrn: string, state: PostState) {
  const stateJSON = JSON.stringify(state);
  await evaluateOnServiceWorker(
    `self.__E2E_TEST_SAVE_POST_STATE(${JSON.stringify(postUrn)}, ${stateJSON})`
  );
}

// NEW helper to inject logs into the service worker
async function injectLogs(logs: LogEntry[]) {
  const logsJSON = JSON.stringify(logs);
  await evaluateOnServiceWorker(
    `self.__E2E_TEST_SET_LOGS(${logsJSON})`
  );
}

async function pushStateToUI(pageId: string, payload: Partial<UIState>) {
  await action({
    action: 'evaluate',
    pageId,
    expression: `
      window.postMessage({
        source: '__E2E_TEST__',
        type: 'STATE_UPDATE',
        payload: ${JSON.stringify(payload)},
      }, '*');
    `,
  });
  await new Promise((r) => setTimeout(r, 100)); // Give React a moment to re-render
}

// --- Mock Data ---

const MOCK_POST_URN = 'urn:li:activity:7123456789012345678';
const now = new Date().toISOString();

const MOCK_POST_STATE: PostState = {
  _meta: {
    postId: MOCK_POST_URN,
    postUrl: `https://www.linkedin.com/feed/update/${MOCK_POST_URN}/`,
    lastUpdated: now, // This will be overwritten by savePostState, so we ignore it in tests
    runState: 'idle',
    userProfileUrl: 'https://www.linkedin.com/in/test-user/',
  },
  comments: [
    {
      commentId: 'comment1',
      text: 'This is the first comment.',
      ownerProfileUrl: 'https://www.linkedin.com/in/commenter-one/',
      timestamp: '1d',
      type: 'top-level',
      threadId: 'comment1',
      likeStatus: 'DONE',
      replyStatus: 'DONE',
      dmStatus: 'SKIPPED',
      attempts: { like: 1, reply: 1, dm: 0 },
      lastError: '',
      pipeline: {
        queuedAt: now,
        likedAt: now,
        repliedAt: now,
        dmAt: '',
        generatedReply: 'Thanks for your comment!',
      },
    },
    {
      commentId: 'comment2',
      text: 'This is the second comment.',
      ownerProfileUrl: 'https://www.linkedin.com/in/commenter-two/',
      timestamp: '2d',
      type: 'top-level',
      threadId: 'comment2',
      likeStatus: 'DONE',
      replyStatus: 'FAILED',
      dmStatus: '',
      attempts: { like: 1, reply: 3, dm: 0 },
      lastError: 'Failed to post reply.',
      pipeline: {
        queuedAt: now,
        likedAt: now,
        repliedAt: '',
        dmAt: '',
        generatedReply: 'This was a great point!',
      },
    },
  ],
};

const MOCK_LOGS: LogEntry[] = [
  { timestamp: now, level: 'INFO', message: 'Pipeline started.' },
  {
    timestamp: now,
    level: 'DEBUG',
    message: 'Processing comment1',
    context: { commentId: 'comment1' },
  },
  {
    timestamp: now,
    level: 'INFO',
    message: 'Reply posted for comment1',
    context: { commentId: 'comment1' },
  },
  {
    timestamp: now,
    level: 'WARN',
    message: 'Failed to post reply for comment2 after 3 attempts',
    context: { commentId: 'comment2' },
  },
  { timestamp: now, level: 'INFO', message: 'Pipeline finished.' },
];

// --- Test Suite ---

test.describe('Controls Component Post-Pipeline', () => {
  let pageId: string;

  test.beforeEach(async () => {
    test.setTimeout(60_000);
    const up = await serverUp();
    expect(up, 'Shared browser server must be running').toBeTruthy();

    pageId = await newTestPageId();
    expect(pageId, 'A new page should be created').toBeTruthy();

    const targetUrl = `https://www.linkedin.com/feed/update/${MOCK_POST_URN}/`;
    await action({
      action: 'goto',
      pageId,
      url: targetUrl,
      waitUntil: 'domcontentloaded',
      timeoutMs: 60_000,
    });

    await waitForSelectorEval(pageId, '#lea-toggle', 45_000);
    await waitForSelectorEval(
      pageId,
      '#linkedin-engagement-assistant-root',
      45_000
    );

    // Set up the post-pipeline state in the background
    await injectPostState(MOCK_POST_URN, MOCK_POST_STATE);
    await injectLogs(MOCK_LOGS);

    // Push state to UI to render components correctly
    await pushStateToUI(pageId, {
      comments: MOCK_POST_STATE.comments,
      pipelineStatus: MOCK_POST_STATE._meta.runState,
      postUrn: MOCK_POST_STATE._meta.postId,
    });
  });

  test.afterEach(async () => {
    if (pageId) {
      await action({ action: 'closePage', pageId });
    }
  });

  test('should display the correct control button based on pipeline status', async () => {
    // The beforeEach sets the state to 'idle', simulating a completed or not-yet-started run.
    // We verify the UI reflects this by showing the "Start" button.
    expect(await isSelectorVisibleInShadowDom(pageId, '[data-testid="start-button"]')).toBe(true);
    expect(await isSelectorVisibleInShadowDom(pageId, '[data-testid="stop-button"]')).toBe(false);
    expect(await isSelectorVisibleInShadowDom(pageId, '[data-testid="resume-button"]')).toBe(false);
  });

  test('should export complete and accurate JSON data', async () => {
    await action({
      action: 'click',
      pageId,
      selector: '[data-testid="export-json-button"]',
    });

    const { result: exportedState } = (await evaluateOnServiceWorker(
      'self.__E2E_LAST_EXPORTED_STATE'
    )) as { result: PostState };

    // The `lastUpdated` timestamp is dynamic. We match it against the received value.
    const expectedState = JSON.parse(JSON.stringify(MOCK_POST_STATE));
    expectedState._meta.lastUpdated = exportedState._meta.lastUpdated;

    expect(exportedState).toEqual(expectedState);
  });

  test('should export all relevant session logs', async () => {
    await action({
      action: 'click',
      pageId,
      selector: '[data-testid="export-logs-button"]',
    });

    const { result: exportedLogs } = await evaluateOnServiceWorker(
      'self.__E2E_LAST_EXPORTED_LOGS'
    );

    expect(exportedLogs).toEqual(MOCK_LOGS);
  });

  test('should clear all data and reset the UI on session reset', async () => {
    await action({
      action: 'evaluate',
      pageId,
      expression: 'window.confirm = () => true;',
    });

    await action({
      action: 'click',
      pageId,
      selector: '[data-testid="reset-session-button"]',
    });

    // Wait for the UI to reflect the reset state
    await waitForSelectorText(pageId, '[data-testid="total-comments-count"]', '0');

    const { result: uiState } = await action({
      action: 'evaluate',
      pageId,
      expression: `
        (() => {
          const host = document.getElementById('linkedin-engagement-assistant-root');
          const root = host && host.shadowRoot;
          if (!root) return { total: -1, user: -1, progressItems: -1 };
          const total = root.querySelector('[data-testid="total-comments-count"]')?.textContent;
          const user = root.querySelector('[data-testid="user-comments-count"]')?.textContent;
          const progressItems = root.querySelectorAll('[data-testid="pipeline-progress-item"]').length;
          return { total, user, progressItems };
        })()
      `,
    });

    expect(uiState.total).toBe('0');
    expect(uiState.user).toBe('0');
    expect(uiState.progressItems).toBe(0);

    const { result: backgroundState } = await evaluateOnServiceWorker(
      `self.__E2E_TEST_GET_POST_STATE(${JSON.stringify(MOCK_POST_URN)})`
    );

    expect(backgroundState).toBeUndefined();
  });
});