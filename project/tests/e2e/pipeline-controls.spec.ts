import { test, expect } from '@playwright/test';

const LINKEDIN_POST_URL =
  'https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/';

test.describe('Pipeline Controls E2E Test', () => {
  test('should correctly cycle through Start, Stop, and Resume states', async ({
    page,
  }) => {
    // 1. ARRANGE: Navigate to the target page and wait for the UI to be injected.
    await page.goto(LINKEDIN_POST_URL);
    const sidebar = page.locator('div.sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Define locators for all control buttons within the sidebar's shadow DOM.
    const startButton = sidebar.locator('button', { hasText: 'Start' });
    const stopButton = sidebar.locator('button', { hasText: 'Stop' });
    const resumeButton = sidebar.locator('button', { hasText: 'Resume' });

    // 2. ASSERT: Verify the initial 'idle' state.
    // The 'Start' button should be visible, and others hidden.
    await expect(startButton).toBeVisible();
    await expect(stopButton).not.toBeVisible();
    await expect(resumeButton).not.toBeVisible();

    // 3. ACT & ASSERT: Test the START action.
    // Click start and wait for the UI to update to the 'running' state,
    // which is indicated by the 'Stop' button appearing.
    // This tests the full message loop: UI -> Service Worker -> UI.
    await startButton.click();
    await expect(stopButton).toBeVisible();
    await expect(startButton).not.toBeVisible();

    // 4. ACT & ASSERT: Test the STOP (pause) action.
    // Click stop and wait for the UI to update to the 'paused' state.
    await stopButton.click();
    await expect(resumeButton).toBeVisible();
    await expect(stopButton).not.toBeVisible();

    // 5. ACT & ASSERT: Test the RESUME action.
    // Click resume and wait for the UI to update back to the 'running' state.
    await resumeButton.click();
    await expect(stopButton).toBeVisible();
    await expect(resumeButton).not.toBeVisible();
  });
});