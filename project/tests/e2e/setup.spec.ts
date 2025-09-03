import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';

const pathToExtension = path.resolve(__dirname, '../../dist');

test.describe('Extension E2E Setup', () => {
  let context: BrowserContext;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false, // Set to true for CI/CD, false for local debugging
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
  });

  test.afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  test('should load the extension and inject the content script on linkedin.com', async () => {
    const page = await context.newPage();
    await page.goto('https://www.linkedin.com');

    // The content script from src/content-scripts/index.ts injects a div with class 'sidebar'
    const sidebarLocator = page.locator('.sidebar');

    // Assert that the sidebar is visible, which confirms the content script has run
    await expect(sidebarLocator).toBeVisible({ timeout: 10000 });

    await page.close();
  });
});