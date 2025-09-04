import { test, expect } from './fixtures';

// Test data constants
const TEST_POST_URL = 'https://www.linkedin.com/feed/update/urn:li:activity:7368619407989760000/';

test.describe('Pipeline Control E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a LinkedIn post page
    await page.goto(TEST_POST_URL, { waitUntil: 'domcontentloaded' });

    // Wait for the sidebar to be attached to the DOM.
    // This is more reliable than a fixed timeout.
    const sidebarRootLocator = page.locator('#linkedin-engagement-assistant-root');
    await expect(sidebarRootLocator).toBeAttached({ timeout: 15000 });
  });

  test('should successfully control pipeline lifecycle: start, stop, and resume', async ({ page }) => {
    // Define locators for the control buttons within the sidebar's shadow DOM.
    // Playwright's locator piercing handles the shadow DOM automatically.
    const sidebarRootLocator = page.locator('#linkedin-engagement-assistant-root');
    const startButtonLocator = sidebarRootLocator.locator('[data-testid="start-button"]');
    const stopButtonLocator = sidebarRootLocator.locator('[data-testid="stop-button"]');
    const resumeButtonLocator = sidebarRootLocator.locator('[data-testid="resume-button"]');

    await test.step('Verify initial state is "idle"', async () => {
      // In the idle state, only the Start button should be visible.
      await expect(startButtonLocator).toBeVisible();
      await expect(stopButtonLocator).toBeHidden();
      await expect(resumeButtonLocator).toBeHidden();
    });

    await test.step('Start the pipeline and verify state is "running"', async () => {
      // Click the start button to begin the pipeline.
      await startButtonLocator.click();
      
      // After starting, the Stop button should become visible, and Start should be hidden.
      // Web-first assertions automatically wait for the UI to update.
      await expect(stopButtonLocator).toBeVisible({ timeout: 5000 });
      await expect(startButtonLocator).toBeHidden();
    });

    await test.step('Stop the pipeline and verify state is "paused"', async () => {
      // The mock fetch in fixtures.ts holds the pipeline in a running state,
      // allowing us to test stopping it. A small delay ensures the pipeline
      // has entered its processing loop before we interrupt it.
      await page.waitForTimeout(1000); 
      await stopButtonLocator.click();
      
      // After stopping, the Resume button should be visible, and Stop should be hidden.
      await expect(resumeButtonLocator).toBeVisible({ timeout: 5000 });
      await expect(stopButtonLocator).toBeHidden();
    });

    await test.step('Resume the pipeline and verify state is "running"', async () => {
      // Click the resume button to continue the pipeline.
      await resumeButtonLocator.click();
      
      // After resuming, the Stop button should be visible again.
      await expect(stopButtonLocator).toBeVisible({ timeout: 5000 });
      await expect(resumeButtonLocator).toBeHidden();
    });

    await test.step('Perform final cleanup by stopping the pipeline', async () => {
      // Stop the pipeline to leave it in a clean state for any subsequent tests.
      await stopButtonLocator.click();
      
      // Verify it's paused again.
      await expect(resumeButtonLocator).toBeVisible({ timeout: 5000 });
    });
  });
});