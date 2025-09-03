// fixtures.ts
import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const test = base.extend<{
    context: BrowserContext;
    extensionId: string;
}>({
    // This fixture now captures all background service worker logs
    context: async ({ }, use, testInfo) => { // <-- Add testInfo
        const pathToExtension = path.resolve(__dirname, '../../dist');

        // Array to store service worker logs
        const backgroundLogs: string[] = [];

        const context = await chromium.launchPersistentContext('', {
            headless: false,
            args: [
                `--disable-extensions-except=${pathToExtension}`,
                `--load-extension=${pathToExtension}`,
            ],
        });

        // --- CAPTURE BACKGROUND LOGS ---
        context.on('serviceworker', (worker) => {
            worker.on('console', (msg) => {
                backgroundLogs.push(`[BG_LOG] ${msg.text()}`);
            });
            worker.on('pageerror', (err) => { // Listen for uncaught errors in worker
                backgroundLogs.push(`[BG_ERROR] ${err.message}`);
            });
        });
        // --- END CAPTURE ---

        await use(context);

        // --- PRINT ON FAILURE ---
        if (testInfo.status !== testInfo.expectedStatus) {
            console.log('\n--- BACKGROUND SERVICE WORKER LOGS ON FAILURE ---');
            console.log(backgroundLogs.join('\n'));
            console.log('--------------------------------------------------');
        }
        // --- END PRINT ---

        await context.close();
    },

    extensionId: async ({ context }, use) => {
        let [background] = context.serviceWorkers();
        if (!background) {
            background = await context.waitForEvent('serviceworker');
        }
        const extensionId = background.url().split('/')[2];
        await use(extensionId);
    },

    // This new fixture override captures all page/content-script logs
    page: async ({ page }, use, testInfo) => {
        // Array to store page/content-script logs
        const pageLogs: string[] = [];

        // --- CAPTURE PAGE LOGS ---
        page.on('console', (msg) => {
            // Store formatted message
            // exclure endgroup messages
            if (msg.type() === 'endGroup') return;
            pageLogs.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
        });

        // Listen for uncaught exceptions on the page
        page.on('pageerror', (err) => {
            pageLogs.push(`[PAGE_ERROR] ${err.message} \n ${err.stack}`);
        });
        // --- END CAPTURE ---

        await use(page); // <-- The test runs here

        // --- PRINT ON FAILURE ---
        // This code runs after the test step has completed
        if (testInfo.status !== testInfo.expectedStatus) {
            console.log('\n--- PAGE & CONTENT SCRIPT LOGS ON FAILURE ---');
            console.log(pageLogs.join('\n'));
            console.log('-------------------------------------------------');
        }
        // --- END PRINT ---
    },
});

export const expect = test.expect;