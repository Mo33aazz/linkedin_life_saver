import { test, expect } from '@playwright/test';
import type { UIState, RunState, AIConfig } from '../../src/shared/types';

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

async function waitForSelectorEval(
  pageId: string,
  selector: string,
  timeoutMs = 45_000
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await action({
      action: 'evaluate',
      pageId,
      expression: `!!document.querySelector(${JSON.stringify(selector)})`,
    }).catch(() => ({ result: false }));
    if (res && (res.result === true || res.result === 'true')) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timeout waiting for selector: ${selector}`);
}

// Helper to send state updates to the UI via postMessage
async function updateUIState(pageId: string, payload: Partial<UIState>) {
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
    test.setTimeout(120_000);
    const up = await serverUp();
    expect(up, 'Shared browser server must be running').toBeTruthy();

    const np = await action({ action: 'newPage' });
    pageId = np?.pageId;
    expect(pageId, 'A new page should be created').toBeTruthy();

    const targetUrl = 'https://www.linkedin.com/feed/update/urn:li:activity:7368619407989760000/';
    await action({ action: 'goto', pageId, url: targetUrl, waitUntil: 'load', timeoutMs: 60_000 });

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

      const statusInfo = await action({
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
    expect(configInfo).toContain('Max Replies: N/A');
    expect(configInfo).toContain('Delay: N/A');

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
    expect(configInfo).toContain('Max Replies: 50');
    expect(configInfo).toContain('Delay: 2000ms - 8000ms');
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
    expect(userInfo.text).toContain('Not available');
    expect(userInfo.href).toBeFalsy();

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
    expect(userInfo.text).toBe(testUrl);
    expect(userInfo.href).toBe(testUrl);
  });

  test('should display target post info correctly', async () => {
    // Test N/A state
    await updateUIState(pageId, { postUrn: undefined, postAuthor: undefined, postTimestamp: undefined });
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
    expect(postInfo.text).toContain('N/A');
    expect(postInfo.text).toContain('Author: N/A');
    expect(postInfo.text).toContain('Timestamp: N/A');
    expect(postInfo.href).toBeFalsy();

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
    expect(postInfo.linkText).toBe(postData.postUrn);
    expect(postInfo.href).toBe(`https://www.linkedin.com/feed/update/${postData.postUrn}/`);
    expect(postInfo.text).toContain(`Author: ${postData.postAuthor}`);
    expect(postInfo.text).toContain(`Timestamp: ${postData.postTimestamp}`);
  });
});