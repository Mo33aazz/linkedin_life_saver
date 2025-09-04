/// <reference lib="webworker" />
/// <reference lib="dom" />
import 'dotenv/config';
import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Injects a script into the service worker to instrument both console logging and the fetch API.
 * This ensures that both capabilities are available from the absolute start of the worker's lifecycle.
 * @param sw The Playwright Worker object representing the service worker.
 */
const instrumentServiceWorker = async (sw: Worker) => {
    await sw.evaluate(() => {
        const globalScope = self as typeof self & Record<string, unknown>;

        // Prevent re-instrumentation
        if (globalScope.__playwright_instrumented__) {
            return;
        }
        globalScope.__playwright_instrumented__ = true;

        // --- 1. SETUP LOG CAPTURING ---
        globalScope.__playwright_logs__ = [];
        const captureLog = (type: string, ...args: unknown[]) => {
            const seen = new Set();
            const message = args.map(arg => {
                if (arg instanceof Error) return arg.stack;
                try {
                    // Handle circular references which can occur in complex objects
                    return JSON.stringify(arg, (_key, value) => {
                        if (typeof value === 'object' && value !== null) {
                            if (seen.has(value)) return '[Circular]';
                            seen.add(value);
                        }
                        return value;
                    });
                } catch {
                    return String(arg);
                }
            }).join(' ');
            (globalScope.__playwright_logs__ as { type: string, message: string, timestamp: string }[]).push({ type, message, timestamp: new Date().toISOString() });
        };

        // Override console methods
        console.log = (...args) => captureLog('LOG', ...args);
        console.warn = (...args) => captureLog('WARN', ...args);
        console.error = (...args) => captureLog('ERROR', ...args);
        console.info = (...args) => captureLog('INFO', ...args);
        console.debug = (...args) => captureLog('DEBUG', ...args);
        // Capture uncaught exceptions and unhandled promise rejections
        self.addEventListener('error', (event) => captureLog('EXCEPTION', event.error || event.message));
        self.addEventListener('unhandledrejection', (event) => captureLog('UNHANDLED_REJECTION', event.reason));

        // --- 2. SETUP FETCH MOCKING ---
        const originalFetch = globalScope.fetch;
        globalScope.fetch = async (url: Request | string | URL, config?: globalThis.RequestInit): Promise<Response> => {
            const requestUrl = (url instanceof Request) ? url.url : String(url);
            // Log the intercepted call for debugging purposes
            console.log(`[Playwright Mock] Intercepting fetch: ${requestUrl}`);

            // --- TEST-SPECIFIC MOCKING ---
            // For pipeline-controls.spec.ts, we need to pause the pipeline.
            // We do this by intercepting the AI call and never resolving the promise.
            if (requestUrl.includes('openrouter.ai/api/v1/chat/completions')) {
                console.log('[Playwright Mock] Holding OpenRouter request indefinitely for pipeline test.');
                return new Promise(() => { /* This promise never resolves */ });
            }

            // For settings-persistence.spec.ts, we need to return a mock list of models.
            if (requestUrl.includes('openrouter.ai/api/v1/models')) {
                console.log('[Playwright Mock] Responding with mocked model list for settings test.');
                const mockModels = [
                    { id: 'mock/model-1', name: 'Mock Model One' },
                    { id: 'mock/model-2', name: 'Mock Model Two (Selected)' },
                    { id: 'mock/model-3', name: 'Mock Model Three' },
                ];
                return new Response(JSON.stringify({ data: mockModels }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // =======================================================
            // ===           YOUR MOCKING LOGIC HERE               ===
            // =======================================================
            // This logic runs inside the service worker.

            // Example: Mock a specific API endpoint for user data
            if (requestUrl.includes('/api/user/profile')) {
                console.log('[Playwright Mock] Responding with mocked user profile.');
                const mockResponse = { id: 'mock-user-123', name: 'Mocked User from Service Worker' };
                return new Response(JSON.stringify(mockResponse), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // Example: Block requests to analytics services
            if (requestUrl.includes('google-analytics.com')) {
                console.log(`[Playwright Mock] Blocking request to ${requestUrl}`);
                return new Response(null, { status: 404, statusText: 'Blocked by Playwright Mock' });
            }

            // For all other requests, call the original fetch to allow them to proceed to the real network
            return originalFetch(url, config);
        };
    });
};

export const test = base.extend<{
    context: BrowserContext;
    extensionId: string;
    background: Worker;
}>({
    context: async ({ }, use, testInfo) => {
        const pathToExtension = path.resolve(__dirname, '../../dist');
        const context = await chromium.launchPersistentContext('', {
            headless: false,
            args: [
                `--disable-extensions-except=${pathToExtension}`,
                `--load-extension=${pathToExtension}`,
            ],
        });

        // --- PROACTIVE INSTRUMENTATION FOR THE SERVICE WORKER ---
        // This is the core of the solution. We set up a listener that instruments
        // the service worker as soon as Playwright detects its creation.

        const serviceWorkerPromise = new Promise<Worker>(resolve => {
            context.on('serviceworker', async (sw) => {
                await instrumentServiceWorker(sw);
                resolve(sw);
            });
        });

        // Handle the race condition where the worker might already exist when we start listening.
        let serviceWorker = context.serviceWorkers()[0];
        if (serviceWorker) {
            await instrumentServiceWorker(serviceWorker);
        } else {
            serviceWorker = await serviceWorkerPromise; // Wait for the listener to find it.
        }

        // Add authentication cookie from .env file
        if (process.env.LINKEDIN_COOKIE) {
            const cookie = {
                name: 'li_at',
                value: process.env.LINKEDIN_COOKIE,
                domain: '.linkedin.com',
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'None' as const,
                expires: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
            };
            await context.addCookies([cookie]);
        } else {
            console.warn('LINKEDIN_COOKIE environment variable not set. Running tests in a logged-out state.');
        }

        // `addInitScript` is for PAGES (content scripts, popups), not the service worker.
        // It's kept here in case you need separate mocking logic for the page context.
        await context.addInitScript(() => {
            // console.log('This is an init script running on a page, not the service worker.');
        });

        // The test runs here, with the service worker fully instrumented.
        await use(context);

        // After the test is complete, retrieve all logs from the service worker's global array.
        const backgroundLogs: { type: string, message: string, timestamp: string }[] = await serviceWorker.evaluate(() => (self as { __playwright_logs__?: { type: string, message: string, timestamp: string }[] }).__playwright_logs__ || []);

        // Only display the logs if the test failed, to keep test output clean on success.
        if (testInfo.status !== testInfo.expectedStatus) {
            console.log('\n--- BACKGROUND SERVICE WORKER LOGS ON FAILURE ---');
            if (backgroundLogs.length > 0) {
                backgroundLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                backgroundLogs.forEach((log) => {
                    console.log(`[${log.timestamp}] [BG_${log.type}] ${log.message}`);
                });
            } else {
                console.log('No logs captured from service worker.');
            }
            console.log('--------------------------------------------------');
        }

        await context.close();
    },

    background: async ({ context }, use) => {
        let [backgroundWorker] = context.serviceWorkers();
        if (!backgroundWorker) {
            backgroundWorker = await context.waitForEvent('serviceworker');
        }
        await use(backgroundWorker);
    },

    extensionId: async ({ background }, use) => {
        const extensionId = background.url().split('/')[2];
        await use(extensionId);
    },

    page: async ({ page }, use, testInfo) => {
        const pageLogs: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error' && msg.text().includes('ERR_FAILED')) return;
            if (msg.type() === 'endGroup') return;
            pageLogs.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
        });
        page.on('pageerror', (err) => {
            pageLogs.push(`[PAGE_ERROR] ${err.stack}`);
        });

        await use(page);

        if (testInfo.status !== testInfo.expectedStatus) {
            console.log('\n--- PAGE & CONTENT SCRIPT LOGS ON FAILURE ---');
            if (pageLogs.length > 0) {
                console.log(pageLogs.join('\n'));
            } else {
                console.log('No logs captured from page.');
            }
            console.log('-------------------------------------------------');
        }
    },
});

export const expect = test.expect;