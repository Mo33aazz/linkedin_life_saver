import { test, expect } from '@playwright/test';
import type { PostState, UIState } from '../../src/shared/types';

// Test result types
interface StepResult {
  commentId: string | null;
  completeSteps?: number;
  failedSteps?: number;
}

interface StepStatusResult {
  commentId: string | null;
  steps?: {
    queued: string;
    liked: string;
    replied: string;
    dmSent: string;
  };
}

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

// Helper function to wait for shadow DOM elements
async function waitForShadowSelector(
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
        const shadowHost = document.querySelector('#linkedin-engagement-assistant-root');
        if (!shadowHost || !shadowHost.shadowRoot) return false;
        const el = shadowHost.shadowRoot.querySelector(sel);
        if (!el) return false;
        const style = window.getComputedStyle(el);
        const isVisible = style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
        return !!isVisible;
      `,
    }).catch(() => ({ result: false }));
    if (res && (res.result === true || res.result === 'true')) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timeout waiting for shadow selector: ${selector}`);
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

// async function pushLogsToUI(pageId: string, logs: LogEntry[]) {
//   for (const log of logs) {
//     await action({
//       action: 'evaluate',
//       pageId,
//       expression: `
//         window.postMessage({
//           source: '__E2E_TEST__',
//           type: 'LOG_ENTRY',
//           payload: ${JSON.stringify(log)},
//         }, '*');
//       `,
//     });
//   }
//   await new Promise((r) => setTimeout(r, 100));
// }

// --- Mock Data for Different Pipeline States ---

const MOCK_POST_URN = 'urn:li:activity:7368619407989760000';
const now = new Date().toISOString();

// Mock data for completed pipeline
const COMPLETED_PIPELINE_STATE: PostState = {
  _meta: {
    postId: MOCK_POST_URN,
    postUrl: `https://www.linkedin.com/feed/update/${MOCK_POST_URN}/`,
    lastUpdated: now,
    runState: 'idle', // Pipeline completed
    userProfileUrl: 'https://www.linkedin.com/in/test-user/',
  },
  comments: [
    {
      commentId: 'comment1',
      text: 'Great post! Thanks for sharing.',
      ownerProfileUrl: 'https://www.linkedin.com/in/commenter-one/',
      timestamp: '1d',
      type: 'top-level',
      threadId: 'comment1',
      likeStatus: 'DONE',
      replyStatus: 'DONE',
      dmStatus: 'DONE',
      attempts: { like: 1, reply: 1, dm: 1 },
      lastError: '',
      pipeline: {
        queuedAt: now,
        likedAt: now,
        repliedAt: now,
        dmAt: now,
        generatedReply: 'Thank you for your feedback!',
        generatedDm: 'Thanks for engaging with my post!',
      },
    },
    {
      commentId: 'comment2',
      text: 'Interesting perspective on this topic.',
      ownerProfileUrl: 'https://www.linkedin.com/in/commenter-two/',
      timestamp: '2d',
      type: 'top-level',
      threadId: 'comment2',
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
        generatedReply: 'I appreciate your thoughts!',
      },
    },
  ],
};

// Mock data for running pipeline
const RUNNING_PIPELINE_STATE: PostState = {
  _meta: {
    postId: MOCK_POST_URN,
    postUrl: `https://www.linkedin.com/feed/update/${MOCK_POST_URN}/`,
    lastUpdated: now,
    runState: 'running',
    userProfileUrl: 'https://www.linkedin.com/in/test-user/',
  },
  comments: [
    {
      commentId: 'comment1',
      text: 'Great post! Thanks for sharing.',
      ownerProfileUrl: 'https://www.linkedin.com/in/commenter-one/',
      timestamp: '1d',
      type: 'top-level',
      threadId: 'comment1',
      likeStatus: 'DONE',
      replyStatus: '', // Currently being processed
      dmStatus: '',
      attempts: { like: 1, reply: 0, dm: 0 },
      lastError: '',
      pipeline: {
        queuedAt: now,
        likedAt: now,
        repliedAt: '',
        dmAt: '',
        generatedReply: 'Thank you for your feedback!',
      },
    },
    {
      commentId: 'comment2',
      text: 'Interesting perspective on this topic.',
      ownerProfileUrl: 'https://www.linkedin.com/in/commenter-two/',
      timestamp: '2d',
      type: 'top-level',
      threadId: 'comment2',
      likeStatus: '', // Not yet processed
      replyStatus: '',
      dmStatus: '',
      attempts: { like: 0, reply: 0, dm: 0 },
      lastError: '',
      pipeline: {
        queuedAt: now,
        likedAt: '',
        repliedAt: '',
        dmAt: '',
      },
    },
  ],
};

// Mock data for failed pipeline scenarios
const FAILED_PIPELINE_STATE: PostState = {
  _meta: {
    postId: MOCK_POST_URN,
    postUrl: `https://www.linkedin.com/feed/update/${MOCK_POST_URN}/`,
    lastUpdated: now,
    runState: 'error',
    userProfileUrl: 'https://www.linkedin.com/in/test-user/',
  },
  comments: [
    {
      commentId: 'comment1',
      text: 'Great post! Thanks for sharing.',
      ownerProfileUrl: 'https://www.linkedin.com/in/commenter-one/',
      timestamp: '1d',
      type: 'top-level',
      threadId: 'comment1',
      likeStatus: 'DONE',
      replyStatus: 'FAILED',
      dmStatus: '',
      attempts: { like: 1, reply: 3, dm: 0 },
      lastError: 'Failed to post reply after 3 attempts',
      pipeline: {
        queuedAt: now,
        likedAt: now,
        repliedAt: '',
        dmAt: '',
        generatedReply: 'Thank you for your feedback!',
      },
    },
    {
      commentId: 'comment2',
      text: 'Interesting perspective on this topic.',
      ownerProfileUrl: 'https://www.linkedin.com/in/commenter-two/',
      timestamp: '2d',
      type: 'top-level',
      threadId: 'comment2',
      likeStatus: 'FAILED',
      replyStatus: '',
      dmStatus: '',
      attempts: { like: 3, reply: 0, dm: 0 },
      lastError: 'Failed to like comment after 3 attempts',
      pipeline: {
        queuedAt: now,
        likedAt: '',
        repliedAt: '',
        dmAt: '',
      },
    },
  ],
};

// --- Test Suite ---

test.describe('Pipeline Progress Component', () => {
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
  });

  test.afterEach(async () => {
    if (pageId) {
      await action({ action: 'closePage', pageId });
    }
  });

  test('should display idle pipeline status correctly', async () => {
    // Set up idle state with no comments
    await pushStateToUI(pageId, {
      pipelineStatus: 'idle',
      comments: [],
      isInitializing: false,
    });

    // Wait for the pipeline progress component to be visible
    await waitForShadowSelector(pageId, '[data-testid="pipeline-progress"]', 45_000);

    // Verify pipeline status shows 'idle'
    const statusElement = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const shadowHost = document.querySelector('#linkedin-engagement-assistant-root');
        return shadowHost?.shadowRoot?.querySelector('[data-testid="pipeline-status"]')?.textContent;
      `,
    });
    expect(statusElement.result).toContain('idle');

    // Verify idle message is displayed
    const idleMessage = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const shadowHost = document.querySelector('#linkedin-engagement-assistant-root');
        return shadowHost?.shadowRoot?.querySelector('.idle-message')?.textContent;
      `,
    });
    expect(idleMessage.result).toContain('Pipeline is idle');
  });

  test('should display running pipeline status correctly', async () => {
    // Set up running pipeline state
    await injectPostState(MOCK_POST_URN, RUNNING_PIPELINE_STATE);
    await pushStateToUI(pageId, {
      pipelineStatus: 'running',
      comments: RUNNING_PIPELINE_STATE.comments,
      isInitializing: false,
    });

    // Wait for pipeline progress component to be visible
    await waitForShadowSelector(pageId, '[data-testid="pipeline-progress"]', 45_000);

    // Check pipeline status display
    const statusElement = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const shadowHost = document.querySelector('#linkedin-engagement-assistant-root');
        return shadowHost?.shadowRoot?.querySelector('[data-testid="pipeline-status"]')?.textContent;
      `,
    });

    expect(statusElement.result).toContain('running');

    // Check that comment rows are displayed
    const commentRows = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const shadowHost = document.querySelector('#linkedin-engagement-assistant-root');
        return shadowHost?.shadowRoot?.querySelectorAll('[data-testid^="pipeline-row-"]').length;
      `,
    });

    expect(commentRows.result).toBe(2);
  });

  test('should display completed pipeline status correctly', async () => {
    // Set up completed pipeline state
    await injectPostState(MOCK_POST_URN, COMPLETED_PIPELINE_STATE);
    await pushStateToUI(pageId, {
      pipelineStatus: 'idle', // Pipeline completed, back to idle
      comments: COMPLETED_PIPELINE_STATE.comments,
      isInitializing: false,
    });

    // Wait for pipeline progress component to be visible
    await waitForShadowSelector(pageId, '[data-testid="pipeline-progress"]', 45_000);

    // Check pipeline status display
    const statusElement = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const shadowHost = document.querySelector('#linkedin-engagement-assistant-root');
        return shadowHost?.shadowRoot?.querySelector('[data-testid="pipeline-status"]')?.textContent;
      `,
    });

    expect(statusElement.result).toContain('idle');

    // Verify all comments show completed steps
    const completedSteps = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const shadowHost = document.querySelector('#linkedin-engagement-assistant-root');
        const root = shadowHost?.shadowRoot;
        if (!root) return [];
        const rows = root.querySelectorAll('[data-testid^="pipeline-row-"]');
        const results = [];
        rows.forEach(row => {
          const commentId = row.getAttribute('data-comment-id');
          const completeSteps = row.querySelectorAll('[data-testid^="step-indicator-"].step-complete').length;
          results.push({ commentId, completeSteps });
        });
        return results;
      `,
    });

    // First comment should have all 4 steps complete (Queued, Liked, Replied, DM Sent)
    const comment1Result = completedSteps.result.find((r: StepResult) => r.commentId === 'comment1');
    expect(comment1Result?.completeSteps).toBe(4);

    // Second comment should have 3 steps complete (Queued, Liked, Replied - DM was skipped)
    const comment2Result = completedSteps.result.find((r: StepResult) => r.commentId === 'comment2');
    expect(comment2Result?.completeSteps).toBe(3);
  });

  test('should display error pipeline status correctly', async () => {
    // Set up failed pipeline state
    await injectPostState(MOCK_POST_URN, FAILED_PIPELINE_STATE);
    await pushStateToUI(pageId, {
      pipelineStatus: 'error',
      comments: FAILED_PIPELINE_STATE.comments,
      isInitializing: false,
    });

    // Wait for pipeline progress component to be visible
    await waitForShadowSelector(pageId, '[data-testid="pipeline-progress"]', 45_000);

    // Check pipeline status display
    const statusElement = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const shadowHost = document.querySelector('#linkedin-engagement-assistant-root');
        return shadowHost?.shadowRoot?.querySelector('[data-testid="pipeline-status"]')?.textContent;
      `,
    });

    expect(statusElement.result).toContain('error');

    // Verify failed steps are displayed correctly
    const failedSteps = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const shadowHost = document.querySelector('#linkedin-engagement-assistant-root');
        const root = shadowHost?.shadowRoot;
        if (!root) return [];
        const rows = root.querySelectorAll('[data-testid^="pipeline-row-"]');
        const results = [];
        rows.forEach(row => {
          const commentId = row.getAttribute('data-comment-id');
          const failedSteps = row.querySelectorAll('.step-failed').length;
          results.push({ commentId, failedSteps });
        });
        return results;
      `,
    });

    // Both comments should have failed steps
    expect(failedSteps.result.length).toBe(2);
    expect(failedSteps.result.some((r: StepResult) => r.failedSteps && r.failedSteps > 0)).toBe(true);
  });

  test('should show correct step indicators for different action statuses', async () => {
    // Create a mixed state with different step statuses
    const mixedState: PostState = {
      _meta: {
        postId: MOCK_POST_URN,
        postUrl: `https://www.linkedin.com/feed/update/${MOCK_POST_URN}/`,
        lastUpdated: now,
        runState: 'running',
        userProfileUrl: 'https://www.linkedin.com/in/test-user/',
      },
      comments: [
        {
          commentId: 'comment1',
          text: 'Test comment 1',
          ownerProfileUrl: 'https://www.linkedin.com/in/commenter-one/',
          timestamp: '1d',
          type: 'top-level',
          threadId: 'comment1',
          likeStatus: 'DONE',
          replyStatus: 'DONE',
          dmStatus: '', // Currently active
          attempts: { like: 1, reply: 1, dm: 0 },
          lastError: '',
          pipeline: {
            queuedAt: now,
            likedAt: now,
            repliedAt: now,
            dmAt: '',
          },
        },
        {
          commentId: 'comment2',
          text: 'Test comment 2',
          ownerProfileUrl: 'https://www.linkedin.com/in/commenter-two/',
          timestamp: '2d',
          type: 'top-level',
          threadId: 'comment2',
          likeStatus: 'DONE',
          replyStatus: '', // Currently active
          dmStatus: '', // Pending
          attempts: { like: 1, reply: 0, dm: 0 },
          lastError: '',
          pipeline: {
            queuedAt: now,
            likedAt: now,
            repliedAt: '',
            dmAt: '',
          },
        },
        {
          commentId: 'comment3',
          text: 'Test comment 3',
          ownerProfileUrl: 'https://www.linkedin.com/in/commenter-three/',
          timestamp: '3d',
          type: 'top-level',
          threadId: 'comment3',
          likeStatus: '', // Currently active (first step after queued)
          replyStatus: '', // Pending
          dmStatus: '', // Pending
          attempts: { like: 0, reply: 0, dm: 0 },
          lastError: '',
          pipeline: {
            queuedAt: now,
            likedAt: '',
            repliedAt: '',
            dmAt: '',
          },
        },
      ],
    };

    await injectPostState(MOCK_POST_URN, mixedState);
    await pushStateToUI(pageId, {
      pipelineStatus: 'running',
      comments: mixedState.comments,
      isInitializing: false,
    });

    // Wait for pipeline progress component to be visible
    await waitForShadowSelector(pageId, '[data-testid="pipeline-progress"]', 45_000);

    // Check step indicators for each comment
    const stepStatuses = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const host = document.getElementById('linkedin-engagement-assistant-root');
        const root = host && host.shadowRoot;
        if (!root) return [];
        const rows = root.querySelectorAll('[data-testid^="pipeline-row-"]');
        const results = [];
        rows.forEach(row => {
          const commentId = row.getAttribute('data-comment-id');
          const steps = {
            queued: row.querySelector('[data-testid="step-indicator-Queued"]')?.className || '',
            liked: row.querySelector('[data-testid="step-indicator-Liked"]')?.className || '',
            replied: row.querySelector('[data-testid="step-indicator-Replied"]')?.className || '',
            dmSent: row.querySelector('[data-testid="step-indicator-DM-Sent"]')?.className || ''
          };
          results.push({ commentId, steps });
        });
        return results;
      `,
    });

    // Comment1: Queued (complete), Liked (complete), Replied (complete), DM Sent (active)
    const comment1Steps = stepStatuses.result.find((r: StepStatusResult) => r.commentId === 'comment1')?.steps;
    expect(comment1Steps?.queued).toContain('step-complete');
    expect(comment1Steps?.liked).toContain('step-complete');
    expect(comment1Steps?.replied).toContain('step-complete');
    expect(comment1Steps?.dmSent).toContain('step-active');

    // Comment2: Queued (complete), Liked (complete), Replied (active), DM Sent (pending)
    const comment2Steps = stepStatuses.result.find((r: StepStatusResult) => r.commentId === 'comment2')?.steps;
    expect(comment2Steps?.queued).toContain('step-complete');
    expect(comment2Steps?.liked).toContain('step-complete');
    expect(comment2Steps?.replied).toContain('step-active');
    expect(comment2Steps?.dmSent).toContain('step-pending');

    // Comment3: Queued (complete), Liked (active), Replied (pending), DM Sent (pending)
    const comment3Steps = stepStatuses.result.find((r: StepStatusResult) => r.commentId === 'comment3')?.steps;
    expect(comment3Steps?.queued).toContain('step-complete');
    expect(comment3Steps?.liked).toContain('step-active');
    expect(comment3Steps?.replied).toContain('step-pending');
    expect(comment3Steps?.dmSent).toContain('step-pending');
  });

  test('should display failed comment scenarios correctly', async () => {
    await injectPostState(MOCK_POST_URN, FAILED_PIPELINE_STATE);
    await pushStateToUI(pageId, {
      pipelineStatus: 'error',
      comments: FAILED_PIPELINE_STATE.comments,
      isInitializing: false,
    });

    // Wait for pipeline progress component to be visible
    await waitForShadowSelector(pageId, '[data-testid="pipeline-progress"]', 45_000);

    // Check that failed steps are properly indicated
    const failedStepDetails = await action({
      action: 'evaluate',
      pageId,
      expression: `
          const host = document.getElementById('linkedin-engagement-assistant-root');
          const root = host && host.shadowRoot;
          if (!root) return [];
          const rows = root.querySelectorAll('[data-testid^="pipeline-row-"]');
          const results = [];
          rows.forEach(row => {
            const commentId = row.getAttribute('data-comment-id');
            const steps = {
              queued: row.querySelector('[data-testid="step-indicator-Queued"]')?.className || '',
              liked: row.querySelector('[data-testid="step-indicator-Liked"]')?.className || '',
              replied: row.querySelector('[data-testid="step-indicator-Replied"]')?.className || '',
              dmSent: row.querySelector('[data-testid="step-indicator-DM-Sent"]')?.className || ''
            };
            results.push({ commentId, steps });
          });
          return results;
      `,
    });

    // Comment1: Should have failed reply step
    const comment1Steps = failedStepDetails.result.find((r: StepStatusResult) => r.commentId === 'comment1')?.steps;
    expect(comment1Steps?.queued).toContain('step-complete');
    expect(comment1Steps?.liked).toContain('step-complete');
    expect(comment1Steps?.replied).toContain('step-failed');
    expect(comment1Steps?.dmSent).toContain('step-pending');

    // Comment2: Should have failed like step
    const comment2Steps = failedStepDetails.result.find((r: StepStatusResult) => r.commentId === 'comment2')?.steps;
    expect(comment2Steps?.queued).toContain('step-complete');
    expect(comment2Steps?.liked).toContain('step-failed');
    expect(comment2Steps?.replied).toContain('step-pending');
    expect(comment2Steps?.dmSent).toContain('step-pending');
  });

  test('should handle skipped actions correctly', async () => {
    // Create state with skipped DM action
    const skippedState: PostState = {
      _meta: {
        postId: MOCK_POST_URN,
        postUrl: `https://www.linkedin.com/feed/update/${MOCK_POST_URN}/`,
        lastUpdated: now,
        runState: 'idle',
        userProfileUrl: 'https://www.linkedin.com/in/test-user/',
      },
      comments: [
        {
          commentId: 'comment1',
          text: 'Test comment with skipped DM',
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
          },
        },
      ],
    };

    await injectPostState(MOCK_POST_URN, skippedState);
    await pushStateToUI(pageId, {
      pipelineStatus: 'idle',
      comments: skippedState.comments,
      isInitializing: false,
    });

    // Wait for pipeline progress component to be visible
    await waitForShadowSelector(pageId, '[data-testid="pipeline-progress"]', 45_000);

    // First, debug what's actually in the shadow DOM
    const debugInfo = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const host = document.getElementById('linkedin-engagement-assistant-root');
        const root = host && host.shadowRoot;
        if (!root) return { error: 'No shadow root found' };
        
        const progressElement = root.querySelector('[data-testid="pipeline-progress"]');
        if (!progressElement) return { error: 'No pipeline-progress element found' };
        
        const rows = root.querySelectorAll('[data-testid^="pipeline-row-"]');
        const rowInfo = Array.from(rows).map(row => ({
          testid: row.getAttribute('data-testid'),
          commentId: row.getAttribute('data-comment-id'),
          innerHTML: row.innerHTML.substring(0, 200)
        }));
        
        return { rowCount: rows.length, rows: rowInfo };
      `,
    });

    console.log('Debug info:', JSON.stringify(debugInfo.result, null, 2));

    // Check that skipped steps are handled appropriately
    const stepProgression = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const host = document.getElementById('linkedin-engagement-assistant-root');
        const root = host && host.shadowRoot;
        if (!root) return { error: 'No shadow root' };
        
        const row = root.querySelector('[data-testid="pipeline-row-comment1"]');
        if (!row) {
          // Try alternative selector
          const allRows = root.querySelectorAll('[data-testid^="pipeline-row-"]');
          if (allRows.length > 0) {
            const firstRow = allRows[0];
            return {
              queued: firstRow.querySelector('[data-testid="step-indicator-Queued"]')?.className || 'not-found',
              liked: firstRow.querySelector('[data-testid="step-indicator-Liked"]')?.className || 'not-found',
              replied: firstRow.querySelector('[data-testid="step-indicator-Replied"]')?.className || 'not-found',
              dmSent: firstRow.querySelector('[data-testid="step-indicator-DM-Sent"]')?.className || 'not-found'
            };
          }
          return { error: 'No rows found' };
        }
        
        return {
          queued: row.querySelector('[data-testid="step-indicator-Queued"]')?.className || 'not-found',
          liked: row.querySelector('[data-testid="step-indicator-Liked"]')?.className || 'not-found',
          replied: row.querySelector('[data-testid="step-indicator-Replied"]')?.className || 'not-found',
          dmSent: row.querySelector('[data-testid="step-indicator-DM-Sent"]')?.className || 'not-found'
        };
      `,
    });

    console.log('Step progression:', JSON.stringify(stepProgression.result, null, 2));

    // Only run assertions if we have valid data
    if (stepProgression.result && !stepProgression.result.error) {
      expect(stepProgression.result.queued).toContain('step-complete');
      expect(stepProgression.result.liked).toContain('step-complete');
      expect(stepProgression.result.replied).toContain('step-complete');
      // DM step should be pending since it was skipped (not failed)
      expect(stepProgression.result.dmSent).toContain('step-pending');
    } else {
      throw new Error(`Failed to find step elements: ${JSON.stringify(stepProgression.result)}`);
    }
  });
});