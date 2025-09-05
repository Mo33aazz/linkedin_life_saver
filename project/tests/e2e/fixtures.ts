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
 * Injects scripts into the service worker to instrument it for testing.
 * This includes console log capturing and a mechanism for mocking fetch requests.
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

        console.log = (...args) => captureLog('LOG', ...args);
        console.warn = (...args) => captureLog('WARN', ...args);
        console.error = (...args) => captureLog('ERROR', ...args);
        console.info = (...args) => captureLog('INFO', ...args);
        console.debug = (...args) => captureLog('DEBUG', ...args);
        self.addEventListener('error', (event) => captureLog('EXCEPTION', event.error || event.message));
        self.addEventListener('unhandledrejection', (event) => captureLog('UNHANDLED_REJECTION', event.reason));

        // --- 2. SETUP FETCH MOCKING ---
        // This replaces Playwright's `context.route` which can be unreliable for service workers.
        // We override the global fetch and check against a map of mocks registered by tests.
        globalScope.__E2E_FETCH_MOCKS__ = new Map();
        const originalFetch = self.fetch;

        type MockResponseType = { status: number; body: object; contentType?: string } | { hang: boolean };

        globalScope.__E2E_MOCK_FETCH = (
            urlPattern: string,
            mockResponse: MockResponseType
        ) => {
            (globalScope.__E2E_FETCH_MOCKS__ as Map<string, MockResponseType>).set(urlPattern, mockResponse);
            console.log(`[E2E MOCK] Registered mock for pattern: ${urlPattern}`);
        };

        globalScope.__E2E_CLEAR_FETCH_MOCKS = () => {
            (globalScope.__E2E_FETCH_MOCKS__ as Map<string, MockResponseType>).clear();
        };

        self.fetch = async (input, init): Promise<Response> => {
            const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : (input as Request).url);
            const mocks = globalScope.__E2E_FETCH_MOCKS__ as Map<string, MockResponseType>;

            for (const [pattern, mock] of mocks.entries()) {
                if (url.includes(pattern)) {
                    console.log(`[E2E MOCK] Matched fetch for "${url}" with pattern "${pattern}".`);
                    if ('hang' in mock && mock.hang) {
                        console.log('[E2E MOCK] Hanging request indefinitely.');
                        return new Promise(() => { /* This promise never resolves */ });
                    }
                    
                    if ('status' in mock) {
                        console.log('Returning mock response.');
                        return new Response(JSON.stringify(mock.body), {
                            status: mock.status,
                            headers: { 'Content-Type': mock.contentType || 'application/json' },
                        });
                    }
                }
            }
            return originalFetch(input, init);
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

        const serviceWorkerPromise = new Promise<Worker>(resolve => {
            context.on('serviceworker', async (sw) => {
                await instrumentServiceWorker(sw);
                resolve(sw);
            });
        });

        let serviceWorker = context.serviceWorkers()[0];
        if (serviceWorker) {
            await instrumentServiceWorker(serviceWorker);
        } else {
            serviceWorker = await serviceWorkerPromise;
        }

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

        await context.addInitScript(() => {
            // console.log('This is an init script running on a page, not the service worker.');
        });

        await use(context);

        const backgroundLogs: { type: string, message: string, timestamp: string }[] = await serviceWorker.evaluate(() => (self as { __playwright_logs__?: { type: string, message: string, timestamp: string }[] }).__playwright_logs__ || []);

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

        const pollTimeout = 10000;
        const pollInterval = 200;
        const startTime = Date.now();
        let isReady = false;
        while (Date.now() - startTime < pollTimeout) {
            isReady = await backgroundWorker.evaluate(async () => {
                const selfWithHooks = self as unknown as {
                    __E2E_TEST_HOOKS_INSTALLED?: boolean;
                    __E2E_TEST_UPDATE_CONFIG: (config: object) => Promise<void>;
                };

                if (!selfWithHooks.__E2E_TEST_HOOKS_INSTALLED) {
                    return false;
                }

                try {
                    await selfWithHooks.__E2E_TEST_UPDATE_CONFIG({});
                    return true;
                } catch (error) {
                    return false;
                }
            });

            if (isReady) break;
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
        if (!isReady) {
            throw new Error(`Timed out after ${pollTimeout}ms waiting for the service worker to become fully initialized.`);
        }

        await use(backgroundWorker);

        // Teardown: Clear mocks after each test to ensure isolation.
        await backgroundWorker.evaluate(() => {
            const globalScope = self as typeof self & { __E2E_CLEAR_FETCH_MOCKS?: () => void };
            if (globalScope.__E2E_CLEAR_FETCH_MOCKS) {
                globalScope.__E2E_CLEAR_FETCH_MOCKS();
            }
        });
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