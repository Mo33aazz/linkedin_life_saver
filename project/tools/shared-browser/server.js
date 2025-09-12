// Shared Playwright Chromium server with HTTP control + SSE logs
// Usage: node tools/shared-browser/server.js [--port 9223]
// Version: 2.1 (Patched for newPage race condition)

import http from 'http';
import { parse as parseUrl } from 'url';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, resolve, isAbsolute } from 'path';
import { chromium } from '@playwright/test';

// --- Improved Logger ---
const LOG_DIR = join(process.cwd(), 'logs');
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

const logFile = join(LOG_DIR, `shared-browser-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };
const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const COLORS = {
  debug: '\x1b[90m', // gray
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  fatal: '\x1b[41m\x1b[37m', // white on red
  reset: '\x1b[0m',
};

const logger = Object.keys(LOG_LEVELS).reduce((acc, level) => {
  acc[level] = (message, context = {}) => {
    if (LOG_LEVELS[level] < LOG_LEVELS[CURRENT_LOG_LEVEL]) {
      return;
    }

    const timestamp = new Date().toISOString();
    
    // 1. Human-readable console log
    const color = COLORS[level] || '';
    const levelStr = `[${level.toUpperCase()}]`.padEnd(7);
    console.log(`${new Date().toLocaleTimeString()} ${color}${levelStr}${COLORS.reset} - ${message}`);

    // 2. Machine-readable file log (JSON)
    const logEntry = { timestamp, level, message, ...context };
    try {
      writeFileSync(logFile, JSON.stringify(logEntry) + '\n', { flag: 'a' });
    } catch (e) {
      console.error("Failed to write to log file:", e);
    }
  };
  return acc;
}, {});
// --- End Logger ---


const args = process.argv.slice(2);
const argPort = (() => {
  const idx = args.indexOf('--port');
  if (idx !== -1 && args[idx + 1]) return Number(args[idx + 1]);
  return undefined;
})();
const strictPort = (() => {
  if (process.env.SHARED_BROWSER_STRICT_PORT) {
    const v = String(process.env.SHARED_BROWSER_STRICT_PORT).toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') return true;
  }
  return args.includes('--strict-port');
})();

// Parse extensions from CLI/env
function parseExtensionDirs() {
  const out = new Set();
  // CLI: --extensions path1,path2 or multiple --extension path
  const idxExts = args.indexOf('--extensions');
  if (idxExts !== -1 && args[idxExts + 1]) {
    for (const p of String(args[idxExts + 1]).split(',')) if (p.trim()) out.add(p.trim());
  }
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--extension' && args[i + 1]) {
      out.add(args[i + 1].trim());
      i += 2;
    } else i += 1;
  }
  // ENV: SHARED_EXTENSIONS_DIRS or EXTENSION_DIRS (comma-separated)
  const envExt = process.env.SHARED_EXTENSIONS_DIRS || process.env.EXTENSION_DIRS || '';
  for (const p of envExt.split(',')) if (p.trim()) out.add(p.trim());

  // Normalize to absolute paths
  const abs = [...out].map((p) => (isAbsolute(p) ? p : resolve(process.cwd(), p)));
  return abs;
}

let PORT = Number(process.env.SHARED_BROWSER_PORT || argPort || 9223);
const HOST = process.env.SHARED_BROWSER_HOST || '0.0.0.0';
const USER_DATA_DIR = join(process.cwd(), 'tools', 'shared-browser', 'user-data');
const DEFAULT_TIMEOUT_MS = Number(process.env.SHARED_BROWSER_DEFAULT_TIMEOUT_MS || 45000);

if (!existsSync(USER_DATA_DIR)) mkdirSync(USER_DATA_DIR, { recursive: true });

// Simple pub-sub for SSE clients
const clients = new Set();
function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    res.write(data);
  }
}

// State
let browserContext; // Persistent context
const pages = new Map(); // id -> Page
let nextPageId = 1;
// **FIX**: Using a FIFO array for resolvers is more robust than a Map with object keys.
const newPagePromiseResolvers = [];
const queues = new Map(); // pageId -> Promise
const globalQueue = { p: Promise.resolve() };

// **FIXED**: Enqueue function now handles page closures to prevent hangs.
function enqueue(pageId, task) {
  const queueKey = pageId || 'global';
  const queue = queueKey === 'global' ? globalQueue : (queues.get(queueKey) || { p: Promise.resolve() });

  const next = queue.p.then(() => {
    // If we're operating on a page, check if it's still open before running the task.
    if (pageId && !pages.has(String(pageId))) {
      throw new Error(`Page ${pageId} was closed before the action could run.`);
    }
    return task();
  }).catch((e) => {
    const scope = pageId ? 'page' : 'global';
    logger.error(`${scope.charAt(0).toUpperCase() + scope.slice(1)} queue error: ${String(e)}`, { type: 'queue', scope, pageId });
    throw e; // Re-throw so the API caller sees the failure.
  });

  if (queueKey === 'global') {
    globalQueue.p = next;
  } else {
    queues.set(queueKey, { p: next });
  }
  
  return next;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function startBrowser() {
  logger.info('Launching Chromium persistent context', { type: 'startup' });
  const extensionDirs = parseExtensionDirs();

  const chromeArgs = [
    '--start-maximized',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=BlockThirdPartyCookies',
    '--password-store=basic',
    '--use-mock-keychain',
  ];
  if (extensionDirs.length) {
    const joined = extensionDirs.join(',');
    chromeArgs.push(`--disable-extensions-except=${joined}`);
    chromeArgs.push(`--load-extension=${joined}`);
    logger.info(`Loading extensions: ${extensionDirs.join(' | ')}`, { type: 'startup', extensions: extensionDirs });
  }

  const preferredChannels = (process.env.SHARED_BROWSER_CHANNELS || 'chrome,chrome-beta,msedge')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const commonLaunchOpts = {
    headless: false,
    viewport: null,
    args: chromeArgs,
    ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
  };

  let launched = null;
  const chromePath = process.env.CHROME_PATH && process.env.CHROME_PATH.trim();
  if (chromePath) {
    try {
      launched = await chromium.launchPersistentContext(USER_DATA_DIR, {
        ...commonLaunchOpts,
        executablePath: chromePath,
      });
      logger.info(`Using Chrome at CHROME_PATH=${chromePath}`, { type: 'startup' });
    } catch (e) {
      logger.error(`Failed to launch with CHROME_PATH: ${String(e)}`, { type: 'startup' });
    }
  }

  for (const channel of launched ? [] : preferredChannels) {
    try {
      launched = await chromium.launchPersistentContext(USER_DATA_DIR, {
        ...commonLaunchOpts,
        channel,
      });
      logger.info(`Launched with channel=${channel}`, { type: 'startup' });
      break;
    } catch (e) {
      logger.warn(`Channel ${channel} failed: ${String(e)}`, { type: 'startup' });
    }
  }

  if (!launched) {
    logger.info('Launching with bundled Chromium fallback', { type: 'startup' });
    launched = await chromium.launchPersistentContext(USER_DATA_DIR, commonLaunchOpts);
  }

  browserContext = launched;

  await browserContext.addInitScript(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch {}
    try { window.chrome = window.chrome || { runtime: {} }; } catch {}
    try {
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    } catch {}
  });

  // Hook context-level events
  browserContext.on('request', (request) => {
    let pageIdSafe = null;
    try {
      // Check if frame is available before accessing it
      if (!request.isNavigationRequest()) {
        pageIdSafe = findPageIdByFrame(request.frame());
      }
    } catch (e) {
      // Frame not available for navigation requests, which is expected
      pageIdSafe = null;
    }
    
    // **IMPROVED**: Safely summarize postData, handling binary data.
    let postDataSummary = null;
    const postData = request.postData();
    if (postData) {
        postDataSummary = postData.length > 250
            ? `${postData.substring(0, 250)}... (truncated)`
            : postData;
    } else if (request.postDataBuffer()) {
        postDataSummary = `<Binary data: ${request.postDataBuffer().length} bytes>`;
    }

    const context = {
        type: 'network:request',
        method: request.method(),
        url: request.url(),
        resourceType: request.resourceType(),
        hasPostData: !!(postData || request.postDataBuffer()),
        postDataSummary,
        pageId: pageIdSafe,
    };
    logger.debug(`=> ${request.method()} ${request.url()}`, context);
    broadcast(context);
  });

  browserContext.on('response', async (response) => {
    const req = response.request();
    let pageIdSafe = null;
    try {
      // Check if frame is available before accessing it
      if (!req.isNavigationRequest()) {
        pageIdSafe = findPageIdByFrame(req.frame());
      }
    } catch (e) {
      // Frame not available for navigation requests, which is expected
      pageIdSafe = null;
    }
    const context = {
        type: 'network:response',
        url: response.url(),
        status: response.status(),
        ok: response.ok(),
        method: req.method(),
        pageId: pageIdSafe,
    };
    logger.debug(`<= ${response.status()} ${req.method()} ${response.url()}`, context);
    broadcast(context);
  });

  browserContext.on('page', (page) => attachPage(page));

  const firstPage = browserContext.pages()[0] || (await browserContext.newPage());
  attachPage(firstPage);
}

function findPageId(page) {
  if (!page) return null;
  for (const [id, p] of pages.entries()) if (p === page) return id;
  return null;
}

function findPageIdByFrame(frame) {
    try {
        const p = frame?.page?.();
        return p ? findPageId(p) : null;
    } catch {
        return null;
    }
}

function attachPage(page) {
  const existingId = findPageId(page);
  if (existingId) return; // Already attached

  const pageId = String(nextPageId++);
  pages.set(pageId, page);
  
  // **FIXED**: Replaced empty catch block with proper logging.
  try {
    page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS);
  } catch (e) {
    logger.error(`Failed to set default timeouts on page ${pageId}: ${String(e)}`, { pageId, error: String(e) });
  }
  
  const context = { type: 'page:open', pageId, url: page.url() };
  logger.info(`Page opened: ${pageId} (${page.url()})`, context);
  broadcast(context);

  // **FIXED**: Resolve a pending newPage promise using a FIFO queue.
  const promiseControls = newPagePromiseResolvers.shift();
  if (promiseControls) {
    promiseControls.resolve(pageId);
  }

  page.on('close', () => {
    const context = { type: 'page:close', pageId };
    logger.info(`Page closed: ${pageId}`, context);
    broadcast(context);
    pages.delete(pageId);
    
    // **FIXED**: Clear the action queue for the closed page to prevent hangs.
    queues.delete(pageId);
  });

  page.on('console', (msg) => {
    const text = msg.text();
    const severity = msg.type();
    const suppressInvalid = (process.env.SHARED_BROWSER_SUPPRESS_INVALID_EXT_ERRORS || '1').toLowerCase();
    const shouldSuppress = suppressInvalid === '1' || suppressInvalid === 'true' || suppressInvalid === 'yes';

    if (shouldSuppress && text === 'Failed to load resource: net::ERR_FAILED') {
      logger.debug(`[Console/${severity}] ${text} (suppressed)`, { type: 'page:console:suppressed', pageId, text, severity });
      return;
    }

    const context = { type: 'page:console', pageId, text, severity };
    logger.info(`[Console/${severity}] ${text}`, context);
    broadcast(context);
  });

  page.on('pageerror', (err) => {
    const context = { type: 'page:error', pageId, message: String(err) };
    logger.error(`Page error on ${pageId}: ${String(err)}`, context);
    broadcast(context);
  });

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      const context = { type: 'page:navigation', pageId, url: frame.url() };
      logger.info(`Page ${pageId} navigated to ${frame.url()}`, context);
      broadcast(context);
    }
  });
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function handleAction(action, payload) {
    switch (action) {
      case 'newPage':
        return enqueue(null, async () => {
          logger.info(`Action: newPage`, { type: 'action:newPage' });
          // **FIXED**: Replaced Map-based promise with a more robust FIFO queue approach
          // to prevent race conditions and timeouts.
          const id = await new Promise(async (resolve, reject) => {
              newPagePromiseResolvers.push({ resolve, reject });
              try {
                // Trigger the 'page' event which will be handled by attachPage
                await browserContext.newPage();
              } catch(e) {
                // If newPage fails, clean up the resolver and reject the promise
                newPagePromiseResolvers.pop(); 
                reject(e);
              }
          });
          return { pageId: id };
        });
      
      case 'goto': {
        const { pageId, url, waitUntil = 'load' } = payload;
        const page = pages.get(String(pageId));
        if (!page) throw new Error(`Unknown pageId ${pageId}`);
        return enqueue(String(pageId), async () => {
          logger.info(`Action: goto ${url}`, { type: 'action:goto', pageId, url });
          await page.goto(url, { waitUntil });
          return { ok: true, url: page.url() };
        });
      }

      case 'click': {
        const { pageId, selector, options } = payload;
        const page = pages.get(String(pageId));
        if (!page) throw new Error(`Unknown pageId ${pageId}`);
        return enqueue(String(pageId), async () => {
          logger.info(`Action: click '${selector}'`, { type: 'action:click', pageId, selector });
          await page.click(selector, options);
          return { ok: true };
        });
      }
      
      case 'waitForSelector': {
        const { pageId, selector, state = 'visible' } = payload;
        const page = pages.get(String(pageId));
        if (!page) throw new Error(`Unknown pageId ${pageId}`);
        return enqueue(String(pageId), async () => {
            logger.info(`Action: waitForSelector '${selector}'`, { type: 'action:waitForSelector', pageId, selector, state });
            await page.waitForSelector(selector, { state });
            return { ok: true };
        });
      }
      case 'type': {
        const { pageId, selector, text, delay } = payload;
        const page = pages.get(String(pageId));
        if (!page) throw new Error(`Unknown pageId ${pageId}`);
        return enqueue(String(pageId), async () => {
            logger.info(`Action: type '${text}' into '${selector}'`, { type: 'action:type', pageId, selector });
            await page.type(selector, text, typeof delay === 'number' ? { delay } : undefined);
            return { ok: true };
        });
      }
      case 'fill': {
        const { pageId, selector, value } = payload;
        const page = pages.get(String(pageId));
        if (!page) throw new Error(`Unknown pageId ${pageId}`);
        return enqueue(String(pageId), async () => {
            logger.info(`Action: fill '${selector}'`, { type: 'action:fill', pageId, selector });
            await page.fill(selector, value);
            return { ok: true };
        });
      }
      case 'evaluate': {
        const { pageId, expression, arg } = payload;
        const page = pages.get(String(pageId));
        if (!page) throw new Error(`Unknown pageId ${pageId}`);
        return enqueue(String(pageId), async () => {
            logger.info(`Action: evaluate expression`, { type: 'action:evaluate', pageId, expression });
            // SECURITY WARNING: This is equivalent to eval(). Do not expose this server to untrusted clients
            // as it creates a Remote Code Execution (RCE) vulnerability.
            const evaluator = new Function('arg', `return (async (arg) => { ${expression} })(arg);`);
            const result = await page.evaluate(evaluator, arg);
            return { ok: true, result };
        });
      }
      case 'screenshot': {
        const { pageId, fullPage } = payload;
        const page = pages.get(String(pageId));
        if (!page) throw new Error(`Unknown pageId ${pageId}`);
        return enqueue(String(pageId), async () => {
            logger.info(`Action: screenshot`, { type: 'action:screenshot', pageId });
            const buf = await page.screenshot({ fullPage: !!fullPage });
            return { ok: true, base64: buf.toString('base64') };
        });
      }
      case 'closePage': {
        const { pageId } = payload;
        const page = pages.get(String(pageId));
        if (!page) throw new Error(`Unknown pageId ${pageId}`);
        return enqueue(String(pageId), async () => {
            logger.info(`Action: closePage ${pageId}`, { type: 'action:closePage', pageId });
            await page.close();
            return { ok: true };
        });
      }
      case 'evaluateOnServiceWorker': {
        const { expression } = payload;
        return enqueue(null, async () => {
            logger.info(`Action: evaluateOnServiceWorker`, { type: 'action:evaluateOnServiceWorker' });
            const pickExtensionSW = () => {
              const workers = browserContext.serviceWorkers();
              const extWorkers = workers.filter(w => {
                try {
                  const url = w.url();
                  return url && url.startsWith('chrome-extension://') && /\/background\.js(\?|#|$)/.test(url);
                } catch { return false; }
              });
              if (extWorkers.length) return extWorkers[0];
              const anyExt = workers.find(w => {
                try { return w.url().startsWith('chrome-extension://'); } catch { return false; }
              });
              return anyExt || workers[0];
            };

            let serviceWorker = pickExtensionSW();
            if (!serviceWorker) {
              await new Promise(r => setTimeout(r, 700)); // Wait for SW to register
              serviceWorker = pickExtensionSW();
            }
            if (!serviceWorker) throw new Error('Service worker not found');
            const url = (() => { try { return serviceWorker.url(); } catch { return 'unknown'; } })();
            logger.debug(`Evaluating on SW: ${url}`, { type: 'action:evaluateOnServiceWorker:target', url });
            const result = await serviceWorker.evaluate(expression);
            return { ok: true, result };
        });
      }
      default:
        throw new Error(`Unknown action ${action}`);
    }
  }
  
  function listPages() {
    return [...pages.entries()].map(([id, p]) => ({ id, url: p.url(), isClosed: p.isClosed?.() || false }));
  }
  
  function withTimeout(promise, ms, label = 'operation') {
    if (!ms || ms <= 0 || !isFinite(ms)) return promise;
    let to;
    const timeout = new Promise((_, reject) => {
      to = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([
      promise.finally(() => clearTimeout(to)),
      timeout,
    ]);
  }
  
  function handleRequest(req, res) {
    cors(res);
    const { pathname } = parseUrl(req.url || '', true);
  
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }
  
    if (pathname === '/') {
      res.setHeader('Content-Type', 'text/plain');
      return res.end(
        'Shared Playwright Browser Server\n' +
          `Port: ${PORT}\n` +
          'Endpoints:\n' +
          '  GET  /api/status\n' +
          '  POST /api/action { action, ... }\n' +
          '  GET  /logs (SSE)\n'
      );
    }
  
    if (pathname === '/api/status' && req.method === 'GET') {
      return json(res, 200, { ok: true, pages: listPages() });
    }
  
    if (pathname === '/logs' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
  
    if (pathname === '/api/action' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const { action, timeoutMs } = payload;
          if (!action) throw new Error('Missing action');
          const effectiveTimeout = typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_TIMEOUT_MS;
          const result = await withTimeout(handleAction(action, payload), effectiveTimeout, `action:${action}`);
          return json(res, 200, { ok: true, result });
        } catch (e) {
          const message = String(e instanceof Error ? e.message : e);
          const isTimeout = /timed out/i.test(message);
          const err = { ok: false, error: message };
          if (isTimeout) {
            logger.warn(`API timeout: ${message}`, { type: 'api:timeout' });
          } else {
            logger.error(`API error: ${message}`, { type: 'api:error' });
          }
          return json(res, isTimeout ? 408 : 400, err);
        }
      });
      return;
    }
  
    json(res, 404, { ok: false, error: 'Not found' });
  }
  
  async function main() {
    await startBrowser();
    const server = http.createServer(handleRequest);
  
    async function listenWithRetry(startPort) {
      let port = startPort;
      const maxAttempts = 50;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          await new Promise((resolve, reject) => {
            const onError = (err) => { server.off('listening', onListening); reject(err); };
            const onListening = () => { server.off('error', onError); resolve(); };
            server.once('error', onError);
            server.once('listening', onListening);
            server.listen(port, HOST);
          });
          return port; // Success
        } catch (err) {
          if (err.code === 'EADDRINUSE' && !strictPort) {
            const nextPort = port + 1;
            logger.warn(`Port ${port} in use, trying ${nextPort}`, { type: 'startup' });
            port = nextPort;
            continue;
          }
          throw err;
        }
      }
      throw new Error(`Unable to bind on range starting ${startPort} after ${maxAttempts} attempts`);
    }
  
    try {
      PORT = await listenWithRetry(PORT);
      const msg = `Server listening on http://${HOST}:${PORT}`;
      const context = { type: 'startup', host: HOST, port: PORT };
      logger.info(msg, context);
      broadcast({ level: 'info', ...context, message: msg });
    } catch (e) {
      const message = `Failed to bind: ${e && e.code ? e.code + ' ' : ''}${String(e)}`;
      logger.fatal(message, { type: 'startup' });
      process.exit(1);
    }
  
    async function gracefulExit(signal) {
      logger.info(`${signal} received, closing browser and server.`, { type: 'shutdown' });
      try {
        if (browserContext) {
          await browserContext.close();
        }
      } catch (e) {
        logger.error(`Error closing browser: ${String(e)}`, { type: 'shutdown' });
      } finally {
        server.close(() => {
          logger.info('Server closed.', { type: 'shutdown' });
          process.exit(0);
        });
      }
    }
  
    process.on('SIGINT', () => void gracefulExit('SIGINT'));
    process.on('SIGTERM', () => void gracefulExit('SIGTERM'));
  }
  
  main().catch((e) => {
    logger.fatal(String(e), { type: 'startup' });
    process.exit(1);
  });

