import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use, testInfo) => {
    const pathToExtension = path.resolve(__dirname, '../../dist');
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });

    // This init script is the correct way to mock fetch and win the race condition.
    await context.addInitScript(() => {
      const MOCK_API_URL = 'https://openrouter.ai/api/v1/models';
      const MOCK_RESPONSE = {
        data: [
          { id: 'mock/model-1', name: 'Mock Model One' },
          { id: 'mock/model-2', name: 'Mock Model Two (Selected)' },
          { id: 'mock/model-3', name: 'Mock Model Three' },
        ],
      };
      const originalFetch = window.fetch;
      window.fetch = async (url, options) => {
        if (String(url).startsWith(MOCK_API_URL)) { // Use startsWith for flexibility
          console.log(`[MOCK] Intercepted fetch request to: ${url}`);
          return new Response(JSON.stringify(MOCK_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url, options);
      };
    });

    const backgroundLogs: string[] = [];

    // --- THIS IS THE CORRECTED LOG CAPTURE LOGIC ---
    // Listen for the 'backgroundpage' event, which provides a Page object for the service worker.
    context.on('backgroundpage', (page) => {
      // Now we can listen for console messages on this special page.
      page.on('console', (msg) => {
        backgroundLogs.push(`[BG_LOG] ${msg.text()}`);
      });
      page.on('pageerror', (err) => {
        backgroundLogs.push(`[BG_ERROR] ${err.message}`);
      });
    });
    // --- END CORRECTION ---

    await use(context);

    // Print logs on failure
    if (testInfo.status !== testInfo.expectedStatus) {
      console.log('\n--- BACKGROUND SERVICE WORKER LOGS ON FAILURE ---');
      if (backgroundLogs.length > 0) {
        console.log(backgroundLogs.join('\n'));
      } else {
        console.log('No logs captured.');
      }
      console.log('--------------------------------------------------');
    }

    await context.close();
  },

  extensionId: async ({ context }, use) => {
    // This logic correctly gets the extension ID and does not need to change.
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }
    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },

  page: async ({ page }, use, testInfo) => {
    // This fixture for capturing page/content-script logs is correct and does not need to change.
    const pageLogs: string[] = [];
    page.on('console', (msg) => {
      pageLogs.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
        pageLogs.push(`[PAGE_ERROR] ${err.message}`);
    });

    await use(page);

    if (testInfo.status !== testInfo.expectedStatus) {
      console.log('\n--- PAGE & CONTENT SCRIPT LOGS ON FAILURE ---');
      if (pageLogs.length > 0) {
        console.log(pageLogs.join('\n'));
      } else {
        console.log('No logs captured.');
      }
      console.log('-------------------------------------------------');
    }
  },
});

export const expect = test.expect;