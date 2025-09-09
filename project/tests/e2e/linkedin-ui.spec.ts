import { test, expect } from '@playwright/test';

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

test('Extension UI renders and toggle works on LinkedIn post', async () => {
  test.setTimeout(180_000);

  const up = await serverUp();
  expect(up).toBeTruthy();

  // 1) Open a dedicated page via the shared browser server
  const np = await action({ action: 'newPage' });
  const pageId = np?.pageId;
  expect(pageId).toBeTruthy();

  // 2) Navigate to the LinkedIn post URL
  const targetUrl =
    'https://www.linkedin.com/feed/update/urn:li:activity:7368619407989760000/';
  await action({ action: 'goto', pageId, url: targetUrl, waitUntil: 'domcontentloaded', timeoutMs: 60_000 });

  // 3) Wait for our content script UI elements to appear
  await action({ action: 'waitForSelector', pageId, selector: '#lea-toggle', timeoutMs: 45_000 });
  await action({ action: 'waitForSelector', pageId, selector: '#linkedin-engagement-assistant-root', timeoutMs: 45_000 });

  // 4) Verify heading text inside shadow root
  const header = await action({
    action: 'evaluate',
    pageId,
    expression: `
      const host = document.getElementById('linkedin-engagement-assistant-root');
      const root = host && host.shadowRoot;
      const h1 = root && root.querySelector('h1');
      return h1?.textContent?.trim() || null;
    `,
  });
  expect(header?.result).toBe('LinkedIn Engagement Assistant');

  // 5) Confirm Start button exists (initial pipeline idle state)
  const hasStart = await action({
    action: 'evaluate',
    pageId,
    expression: `
      const host = document.getElementById('linkedin-engagement-assistant-root');
      const root = host && host.shadowRoot;
      const btn = root && root.querySelector('button[data-testid="start-button"]');
      return !!btn;
    `,
  });
  expect(Boolean(hasStart?.result)).toBeTruthy();

  // 6) Toggle sidebar closed, verify hidden and toggle icon changes
  await action({ action: 'click', pageId, selector: '#lea-toggle', timeoutMs: 20_000 });
  const hiddenAndChevronRight = await action({
    action: 'evaluate',
    pageId,
    expression: `
      const host = document.getElementById('linkedin-engagement-assistant-root');
      const display = host?.style?.display || '';
      const toggle = document.getElementById('lea-toggle');
      const text = toggle?.textContent || '';
      return { display, text };
    `,
  });
  expect(hiddenAndChevronRight?.result?.display).toBe('none');
  expect(hiddenAndChevronRight?.result?.text).toBe('›');

  // 7) Toggle open again, verify visible with heading
  await action({ action: 'click', pageId, selector: '#lea-toggle', timeoutMs: 20_000 });
  await action({ action: 'waitForSelector', pageId, selector: '#linkedin-engagement-assistant-root', timeoutMs: 20_000 });

  const reHeader = await action({
    action: 'evaluate',
    pageId,
    expression: `
      const host = document.getElementById('linkedin-engagement-assistant-root');
      const isHidden = host?.style?.display === 'none';
      const root = host && host.shadowRoot;
      const h1 = root && root.querySelector('h1');
      const text = h1?.textContent?.trim() || null;
      const toggle = document.getElementById('lea-toggle');
      const chevron = toggle?.textContent || '';
      return { isHidden, text, chevron };
    `,
  });
  expect(reHeader?.result?.isHidden).toBeFalsy();
  expect(reHeader?.result?.text).toBe('LinkedIn Engagement Assistant');
  expect(reHeader?.result?.chevron).toBe('‹');

  // 8) Cleanup this page
  await action({ action: 'closePage', pageId });
});

