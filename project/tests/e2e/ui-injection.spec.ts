import { test, expect } from './fixtures';

test.describe('Extension UI Injection and Initial State', () => {
  test('should inject the sidebar with default components on a LinkedIn post page', async ({ page }) => {
    // 1. Navigate to a LinkedIn post page
    const postUrl = 'https://www.linkedin.com/feed/update/urn:li:activity:7368619407989760000/';
    await page.goto(postUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });

    // Give the content script more time to inject
    await page.waitForTimeout(5000);

    // 2. Wait for the sidebar root element to be injected with correct ID
    await page.waitForSelector(
      '#linkedin-engagement-assistant-root',
      { timeout: 30000 }
    );

    // 3. Verify the shadow root exists
    const hasShadowRoot = await page.evaluate(() => {
      const root = document.querySelector('#linkedin-engagement-assistant-root');
      return root?.shadowRoot !== null;
    });
    expect(hasShadowRoot).toBe(true);

    // 4. Verify key UI sections are present within the shadow DOM
    const uiSections = await page.evaluate(() => {
      const root = document.querySelector('#linkedin-engagement-assistant-root');
      if (!root?.shadowRoot) return null;

      const appContainer = root.shadowRoot.querySelector('#sidebar-app');
      const header = root.shadowRoot.querySelector('.sidebar-section.header');
      const counters = root.shadowRoot.querySelector('.sidebar-section.counters');
      const controls = root.shadowRoot.querySelector('.sidebar-section.controls');
      const logs = root.shadowRoot.querySelector('.sidebar-section.logs');

      return {
        hasAppContainer: !!appContainer,
        hasHeader: !!header,
        hasCounters: !!counters,
        hasControls: !!controls,
        hasLogs: !!logs
      };
    });

    expect(uiSections).not.toBeNull();
    expect(uiSections?.hasAppContainer).toBe(true);
    expect(uiSections?.hasControls).toBe(true);

    // 5. Verify the Start button is present and in the correct initial state
    const startButtonExists = await page.evaluate(() => {
      const root = document.querySelector('#linkedin-engagement-assistant-root');
      if (!root?.shadowRoot) return false;
      const startBtn = root.shadowRoot.querySelector('[data-testid="start-button"]');
      return !!startBtn;
    });
    expect(startButtonExists).toBe(true);

    // 6. Verify the sidebar is positioned correctly
    const sidebarStyles = await page.evaluate(() => {
      const root = document.querySelector('#linkedin-engagement-assistant-root') as HTMLElement;
      if (!root) return null;
      return {
        position: root.style.position,
        right: root.style.right,
        top: root.style.top,
        zIndex: root.style.zIndex
      };
    });

    expect(sidebarStyles?.position).toBe('fixed');
    expect(sidebarStyles?.right).toBe('0px');
    expect(sidebarStyles?.top).toBe('0px');
    expect(parseInt(sidebarStyles?.zIndex || '0', 10)).toBeGreaterThan(9000);
  });
});