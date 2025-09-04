import { test, expect } from './fixtures';

test.describe('Pipeline Controls', () => {
  test('should correctly start, stop, and resume the pipeline', async ({
    page,
  }) => {
    // 1. Navigate to a URL that the content script will match.
    await page.goto(
      'https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/'
    );

    // 2. Define locators for the sidebar and control buttons.
    // Playwright automatically pierces shadow DOM when chaining locators.
    const sidebarHost = page.locator('div.sidebar');
    const startButton = sidebarHost.locator('button', { hasText: 'Start' });
    const stopButton = sidebarHost.locator('button', { hasText: 'Stop' });
    const resumeButton = sidebarHost.locator('button', { hasText: 'Resume' });

    // 3. Verify the initial state: The sidebar is visible and in 'idle' mode.
    await expect(sidebarHost).toBeVisible({ timeout: 10000 });
    await expect(startButton).toBeVisible();
    await expect(stopButton).not.toBeVisible();
    await expect(resumeButton).not.toBeVisible();

    // 4. Test the 'Start' action.
    // Clicking 'Start' should change the state to 'running'.
    console.log('Testing: Clicking Start');
    await startButton.click();

    // Assert that the UI reflects the 'running' state.
    await expect(stopButton).toBeVisible();
    await expect(startButton).not.toBeVisible();

    // 5. Test the 'Stop' action.
    // Clicking 'Stop' should change the state to 'paused'.
    console.log('Testing: Clicking Stop');
    await stopButton.click();

    // Assert that the UI reflects the 'paused' state.
    await expect(resumeButton).toBeVisible();
    await expect(stopButton).not.toBeVisible();

    // 6. Test the 'Resume' action.
    // Clicking 'Resume' should change the state back to 'running'.
    console.log('Testing: Clicking Resume');
    await resumeButton.click();

    // Assert that the UI reflects the 'running' state again.
    await expect(stopButton).toBeVisible();
    await expect(resumeButton).not.toBeVisible();
  });
});