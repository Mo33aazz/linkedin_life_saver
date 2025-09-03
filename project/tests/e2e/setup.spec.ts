import { test, expect } from './fixtures';

test.describe('Extension E2E Setup', () => {
  test('should load the extension and inject the content script on linkedin.com', async ({ page }) => {
    // Navigate to a page where the content script is expected to run.
    await page.goto('https://www.linkedin.com/');

    // The content script from src/content-scripts/index.ts injects a div with class 'sidebar'.
    // We wait for this element to be visible to confirm the script has run.
    const sidebarLocator = page.locator('.sidebar');

    // Assert that the sidebar is visible, which confirms the content script is active.
    await expect(sidebarLocator).toBeVisible({ timeout: 100000 });
  });
});