import { test, expect } from './fixtures';

test.describe('Extension E2E Setup', () => {
  test('should load the extension and inject the content script on linkedin.com', async ({ page }) => {
    // Navigate to a page where the content script is expected to run.
    // Using /feed/ is more reliable as it's a standard logged-in page.
    await page.goto('https://www.linkedin.com/feed/');

    // The content script injects a root element with a specific ID.
    const sidebarRootLocator = page.locator(
      '#linkedin-engagement-assistant-root'
    );

    // Assert that the root element is attached to the DOM. This is a more reliable
    // check than `toBeVisible` as it confirms injection even if the UI is not yet visible.
    await expect(sidebarRootLocator).toBeAttached({ timeout: 15000 });
  });
});