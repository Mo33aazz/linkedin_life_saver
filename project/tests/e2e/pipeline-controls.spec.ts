import { test, expect, Page } from '@playwright/test';
import { RunState } from '../../src/shared/types';

const LINKEDIN_POST_URL =
  'https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/';

/**
 * Simulates a state update message from the service worker by directly calling
 * the UI's Zustand store update function. This is a common pattern for E2E testing
 * modern frontends to isolate UI reactivity from background logic.
 *
 * This function assumes that for testing purposes, the Zustand store instance
 * (`useStore`) is exposed on the `window` object in the browser.
 *
 * @param page - The Playwright Page object.
 * @param status - The new pipeline status to set.
 */
async function simulateStateUpdate(page: Page, status: RunState) {
  await page.evaluate((newStatus) => {
    const messagePayload = { pipelineStatus: newStatus };
    // Access the globally exposed store and call its update function,
    // mimicking the behavior of the chrome.runtime.onMessage listener.
    (window as any).useStore.getState().updateState(messagePayload);
  }, status);
}

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
    await startButton.click();
    // Simulate the background script confirming the state change to 'running'.
    await simulateStateUpdate(page, 'running');

    // The UI should now show the 'Stop' button.
    await expect(stopButton).toBeVisible();
    await expect(startButton).not.toBeVisible();

    // 4. ACT & ASSERT: Test the STOP (pause) action.
    await stopButton.click();
    // Simulate the background script confirming the state change to 'paused'.
    await simulateStateUpdate(page, 'paused');

    // The UI should now show the 'Resume' button.
    await expect(resumeButton).toBeVisible();
    await expect(stopButton).not.toBeVisible();

    // 5. ACT & ASSERT: Test the RESUME action.
    await resumeButton.click();
    // Simulate the background script confirming the state change back to 'running'.
    await simulateStateUpdate(page, 'running');

    // The UI should return to the 'running' state, showing the 'Stop' button again.
    await expect(stopButton).toBeVisible();
    await expect(resumeButton).not.toBeVisible();
  });
});