import { test, expect } from './fixtures';

test.describe('Extension UI Injection and Initial State', () => {
  test('should inject the sidebar with default components on a LinkedIn post page', async ({
    page,
  }) => {
    // 1. Navigate to a URL that the content script will match.
    // The URN doesn't need to be real, but the URL structure must be correct.
    await page.goto(
      'https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/'
    );

    // 2. Find the host element for the shadow DOM.
    const sidebarHost = page.locator('div.sidebar');

    // 3. Assert that the sidebar host is visible. This confirms the content script ran.
    await expect(sidebarHost).toBeVisible({ timeout: 10000 }); // Increased timeout for stability

    // 4. Verify the main title of the app is rendered inside the shadow DOM.
    const title = sidebarHost.locator('h1');
    await expect(title).toHaveText('LinkedIn Engagement Assistant');

    // 5. Verify the presence of the main UI sections by checking for their headers.
    const headerSection = sidebarHost.locator('h2', { hasText: 'Header' });
    await expect(headerSection).toBeVisible();

    const countersSection = sidebarHost.locator('h2', {
      hasText: 'Live Counters',
    });
    await expect(countersSection).toBeVisible();

    const controlsSection = sidebarHost.locator('h2', { hasText: 'Controls' });
    await expect(controlsSection).toBeVisible();

    // 6. Verify the initial state of the controls.
    // The 'Start' button should be visible, indicating the pipeline is 'idle'.
    const startButton = sidebarHost.locator('button', { hasText: 'Start' });
    await expect(startButton).toBeVisible();

    // 7. As an extra check, ensure other state-dependent buttons are not visible.
    const stopButton = sidebarHost.locator('button', { hasText: 'Stop' });
    await expect(stopButton).not.toBeVisible();

    const resumeButton = sidebarHost.locator('button', { hasText: 'Resume' });
    await expect(resumeButton).not.toBeVisible();
  });
});