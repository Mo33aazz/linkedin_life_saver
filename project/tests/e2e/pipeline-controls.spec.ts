import { test, expect } from './fixtures';
import type { ExtensionMessage } from '../../src/shared/types';

test.describe('Pipeline Controls (Start, Stop, Resume)', () => {
  test('should correctly cycle through start, stop, and resume states', async ({
    page,
  }) => {
    // 1. Navigate to a URL that the content script will activate on.
    await page.goto(
      'https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/'
    );

    // 2. Define a locator for the sidebar's host element for reuse.
    const sidebarHost = page.locator('div.sidebar');

    // 3. Assert that the sidebar is visible, confirming the extension has loaded.
    await expect(sidebarHost).toBeVisible({ timeout: 10000 });

    // --- START FLOW ---
    // 4. Locate the 'Start' button and verify its initial visibility.
    const startButton = sidebarHost.locator('button', { hasText: 'Start' });
    await expect(startButton).toBeVisible();

    // 5. Simulate the user clicking 'Start'.
    await startButton.click();

    // 6. Simulate the service worker broadcasting the new 'running' state.
    // This uses the test hook defined in `src/ui/store/index.ts` to directly
    // manipulate the UI's state, isolating the test to the UI component itself.
    await page.evaluate(() => {
      const message: ExtensionMessage = {
        type: 'STATE_UPDATE',
        payload: { pipelineStatus: 'running' },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__E2E_TEST_DISPATCH_MESSAGE__(message);
    });

    // 7. Assert the UI has updated: the 'Stop' button should now be visible.
    const stopButton = sidebarHost.locator('button', { hasText: 'Stop' });
    await expect(stopButton).toBeVisible();
    await expect(startButton).not.toBeVisible();

    // --- STOP FLOW ---
    // 8. Simulate a click on the 'Stop' button.
    await stopButton.click();

    // 9. Simulate the service worker broadcasting the 'paused' state.
    await page.evaluate(() => {
      const message: ExtensionMessage = {
        type: 'STATE_UPDATE',
        payload: { pipelineStatus: 'paused' },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__E2E_TEST_DISPATCH_MESSAGE__(message);
    });

    // 10. Assert the UI has updated to show the 'Resume' button.
    const resumeButton = sidebarHost.locator('button', { hasText: 'Resume' });
    await expect(resumeButton).toBeVisible();
    await expect(stopButton).not.toBeVisible();

    // --- RESUME FLOW ---
    // 11. Simulate a click on the 'Resume' button.
    await resumeButton.click();

    // 12. Simulate the service worker broadcasting the 'running' state again.
    await page.evaluate(() => {
      const message: ExtensionMessage = {
        type: 'STATE_UPDATE',
        payload: { pipelineStatus: 'running' },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__E2E_TEST_DISPATCH_MESSAGE__(message);
    });

    // 13. Assert the UI has returned to the 'running' state, showing the 'Stop' button.
    await expect(stopButton).toBeVisible();
    await expect(resumeButton).not.toBeVisible();
  });
});