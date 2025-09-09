import { test, expect } from '@playwright/test';
import type { RunState, AIConfig } from '../../src/shared/types';

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

// Fallback wait helper that verifies visibility (faster fail default)
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

// Helper to send state updates to the UI via postMessage
// Accept a generic payload so we can use nulls to explicitly clear values.
async function updateUIState(pageId: string, payload: Record<string, unknown>) {
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
  // Give React a moment to re-render
  await new Promise(r => setTimeout(r, 100));
}

test.describe('Header Component', () => {
  let pageId: string;

  test.beforeEach(async () => {
    test.setTimeout(60_000);
    const up = await serverUp();
    expect(up, 'Shared browser server must be running').toBeTruthy();

    pageId = await newTestPageId();
    expect(pageId, 'A new page should be created').toBeTruthy();

    const targetUrl = 'https://www.linkedin.com/feed/update/urn:li:activity:7368619407989760000/';
    await action({ action: 'goto', pageId, url: targetUrl, waitUntil: 'domcontentloaded', timeoutMs: 60_000 });

    // Wait for toggle and host like the main UI test to avoid races
    await waitForSelectorEval(pageId, '#lea-toggle', 45_000);
    await waitForSelectorEval(pageId, '#linkedin-engagement-assistant-root', 45_000);
  });

  test.afterEach(async () => {
    if (pageId) {
      await action({ action: 'closePage', pageId });
    }
  });

  test('should display pipeline status correctly', async () => {
    const statuses: { status: RunState; expectedClass: string }[] = [
      { status: 'idle', expectedClass: 'bg-gray-400' },
      { status: 'running', expectedClass: 'bg-green-500' },
      { status: 'paused', expectedClass: 'bg-yellow-500' },
      { status: 'error', expectedClass: 'bg-red-500' },
    ];

    for (const { status, expectedClass } of statuses) {
      await updateUIState(pageId, { pipelineStatus: status });

      const { result: statusInfo } = await action({
        action: 'evaluate',
        pageId,
        expression: `
          const host = document.getElementById('linkedin-engagement-assistant-root');
          const root = host && host.shadowRoot;
          if (!root) return null;
          const statusPanel = root.querySelector('[data-testid="status-panel"]');
          if (!statusPanel) return null;
          const indicator = statusPanel.querySelector('.flex.items-center > span:first-child');
          const text = statusPanel.querySelector('.flex.items-center > span.capitalize');
          return {
            text: text?.textContent,
            indicatorClass: indicator?.className,
          };
        `,
      });

      expect(statusInfo.text).toBe(status);
      expect(statusInfo.indicatorClass).toContain(expectedClass);
    }
  });

  test('should display configuration info correctly', async () => {
    // Test N/A state
    await updateUIState(pageId, { aiConfig: undefined });
    let configInfo = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const host = document.getElementById('linkedin-engagement-assistant-root');
        const root = host && host.shadowRoot;
        if (!root) return null;
        const configPanel = root.querySelector('[data-testid="config-panel"]');
        return configPanel?.textContent;
      `,
    });
    expect(configInfo.result).toContain('Max Replies: N/A');
    expect(configInfo.result).toContain('Delay: N/A');

    // Test populated state
    const testConfig: AIConfig = { maxReplies: 50, minDelay: 2000, maxDelay: 8000 };
    await updateUIState(pageId, { aiConfig: testConfig });
    configInfo = await action({
        action: 'evaluate',
        pageId,
        expression: `
          const host = document.getElementById('linkedin-engagement-assistant-root');
          const root = host && host.shadowRoot;
          if (!root) return null;
          const configPanel = root.querySelector('[data-testid="config-panel"]');
          return configPanel?.textContent;
        `,
      });
    expect(configInfo.result).toContain('Max Replies: 50');
    expect(configInfo.result).toContain('Delay: 2000ms - 8000ms');
  });

  test('should display user info correctly', async () => {
    // Test "Not available" state
    await updateUIState(pageId, { userProfileUrl: undefined });
    let userInfo = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const host = document.getElementById('linkedin-engagement-assistant-root');
        const root = host && host.shadowRoot;
        if (!root) return null;
        const userPanel = root.querySelector('[data-testid="user-panel"]');
        return { text: userPanel?.textContent, href: userPanel?.querySelector('a')?.href };
      `,
    });
    expect(userInfo.result.text).toContain('Not available');
    expect(userInfo.result.href).toBeFalsy();

    // Test populated state
    const testUrl = 'https://www.linkedin.com/in/test-user/';
    await updateUIState(pageId, { userProfileUrl: testUrl });
    userInfo = await action({
        action: 'evaluate',
        pageId,
        expression: `
          const host = document.getElementById('linkedin-engagement-assistant-root');
          const root = host && host.shadowRoot;
          if (!root) return null;
          const userPanel = root.querySelector('[data-testid="user-panel"]');
          const link = userPanel?.querySelector('a');
          return { text: link?.textContent, href: link?.href };
        `,
      });
    expect(userInfo.result.text).toBe(testUrl);
    expect(userInfo.result.href).toBe(testUrl);
  });

  test('should display target post info correctly', async () => {
    // Test N/A state
    // Use null for postUrn so JSON.stringify preserves the field and clears it in the store
    await updateUIState(pageId, { postUrn: null, postAuthor: null, postTimestamp: null });
    let postInfo = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const host = document.getElementById('linkedin-engagement-assistant-root');
        const root = host && host.shadowRoot;
        if (!root) return null;
        const postPanel = root.querySelector('[data-testid="post-panel"]');
        return { text: postPanel?.textContent, href: postPanel?.querySelector('a')?.href };
      `,
    });
    expect(postInfo.result.text).toContain('N/A');
    expect(postInfo.result.text).toContain('Author: N/A');
    expect(postInfo.result.text).toContain('Timestamp: N/A');
    expect(postInfo.result.href).toBeFalsy();

    // Test populated state
    const postData = {
      postUrn: 'urn:li:activity:12345',
      postAuthor: 'Test Author',
      postTimestamp: '2 hours ago',
    };
    await updateUIState(pageId, postData);
    postInfo = await action({
        action: 'evaluate',
        pageId,
        expression: `
          const host = document.getElementById('linkedin-engagement-assistant-root');
          const root = host && host.shadowRoot;
          if (!root) return null;
          const postPanel = root.querySelector('[data-testid="post-panel"]');
          const link = postPanel?.querySelector('a');
          return { text: postPanel?.textContent, href: link?.href, linkText: link?.textContent };
        `,
      });
    expect(postInfo.result.linkText).toBe(postData.postUrn);
    expect(postInfo.result.href).toBe(`https://www.linkedin.com/feed/update/${postData.postUrn}/`);
    expect(postInfo.result.text).toContain(`Author: ${postData.postAuthor}`);
    expect(postInfo.result.text).toContain(`Timestamp: ${postData.postTimestamp}`);
  });
});