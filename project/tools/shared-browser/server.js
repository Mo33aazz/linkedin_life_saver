// Shared Playwright Chromium server with HTTP control + SSE logs
// Usage: node tools/shared-browser/server.js [--port 9223]

import http from 'http';
import { parse as parseUrl } from 'url';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, resolve, isAbsolute } from 'path';
import { chromium } from '@playwright/test';

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
const LOG_DIR = join(process.cwd(), 'logs');
const DEFAULT_TIMEOUT_MS = Number(process.env.SHARED_BROWSER_DEFAULT_TIMEOUT_MS || 45000);

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
if (!existsSync(USER_DATA_DIR)) mkdirSync(USER_DATA_DIR, { recursive: true });

const logFile = join(
  LOG_DIR,
  `shared-browser-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
);

function logLine(lineObj) {
  const line = JSON.stringify(lineObj);
  console.log(line);
  try {
    writeFileSync(logFile, line + '\n', { flag: 'a' });
  } catch {}
}

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
const queues = new Map(); // pageId -> Promise
const globalQueue = { p: Promise.resolve() };

function enqueue(pageId, task) {
  if (pageId === 'global') {
    const n = globalQueue.p.then(task).catch((e) => {
      // swallow to keep chain alive
      logLine({ level: 'error', type: 'queue', scope: 'global', message: String(e) });
    });
    globalQueue.p = n;
    return n;
  }
  const prev = queues.get(pageId) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(task)
    .catch((e) => {
      logLine({ level: 'error', type: 'queue', scope: 'page', pageId, message: String(e) });
      throw e;
    });
  queues.set(pageId, next);
  return next;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function startBrowser() {
  logLine({ level: 'info', type: 'startup', message: 'Launching Chromium persistent context' });
  const extensionDirs = parseExtensionDirs();

  // Hardened args to reduce automation fingerprints and allow login flows
  const chromeArgs = [
    '--start-maximized',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=BlockThirdPartyCookies',
    // Persist credentials/cookies without system keychain prompts (Linux)
    '--password-store=basic',
    '--use-mock-keychain',
  ];
  if (extensionDirs.length) {
    const joined = extensionDirs.join(',');
    chromeArgs.push(`--disable-extensions-except=${joined}`);
    chromeArgs.push(`--load-extension=${joined}`);
    logLine({ level: 'info', type: 'startup', message: `Loading extensions: ${extensionDirs.join(' | ')}` });
  }

  // Prefer vendor Chrome to avoid Google blocking “automation” Chromium builds
  // Try channels in order; allow override via env SHARED_BROWSER_CHANNELS (comma-separated)
  const preferredChannels = (process.env.SHARED_BROWSER_CHANNELS || 'chrome,chrome-beta,msedge')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const commonLaunchOpts = {
    headless: false,
    viewport: null,
    args: chromeArgs,
    // Remove automation switches that some IdPs flag as “not secure”,
    // and allow extensions to load by removing Playwright's default '--disable-extensions'.
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
      logLine({ level: 'info', type: 'startup', message: `Using Chrome at CHROME_PATH=${chromePath}` });
    } catch (e) {
      logLine({ level: 'error', type: 'startup', message: `Failed CHROME_PATH: ${String(e)}` });
    }
  }

  for (const channel of launched ? [] : preferredChannels) {
    try {
      launched = await chromium.launchPersistentContext(USER_DATA_DIR, {
        ...commonLaunchOpts,
        channel,
      });
      logLine({ level: 'info', type: 'startup', message: `Launched with channel=${channel}` });
      break;
    } catch (e) {
      logLine({ level: 'error', type: 'startup', message: `Channel ${channel} failed: ${String(e)}` });
    }
  }

  if (!launched) {
    // Fallback to bundled Chromium
    launched = await chromium.launchPersistentContext(USER_DATA_DIR, commonLaunchOpts);
    logLine({ level: 'info', type: 'startup', message: 'Launched with bundled Chromium fallback' });
  }

  browserContext = launched;

  // Stealth: mask webdriver and a few common signals for all pages
  await browserContext.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    } catch {}
    try {
      // Some sites check for chrome.runtime existence
      window.chrome = window.chrome || { runtime: {} };
    } catch {}
    try {
      // Languages and plugins presence
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    } catch {}
  });

  // Hook context-level events
  browserContext.on('request', (request) => {
    let pageIdSafe = null;
    try {
      const f = request.frame?.();
      const p = f && typeof f.page === 'function' ? f.page() : null;
      pageIdSafe = findPageId(p) || null;
    } catch {}
    const evt = {
      level: 'debug',
      type: 'network:request',
      method: request.method(),
      url: request.url(),
      headers: request.headers(),
      postData: request.postData(),
      resourceType: request.resourceType(),
      pageId: pageIdSafe,
      timestamp: Date.now(),
    };
    logLine(evt);
    broadcast(evt);
  });
  browserContext.on('response', async (response) => {
    const req = response.request();
    let pageIdSafe = null;
    try {
      const f = req.frame?.();
      const p = f && typeof f.page === 'function' ? f.page() : null;
      pageIdSafe = findPageId(p) || null;
    } catch {}
    const evt = {
      level: 'debug',
      type: 'network:response',
      url: response.url(),
      status: response.status(),
      ok: response.ok(),
      method: req.method(),
      pageId: pageIdSafe,
      timestamp: Date.now(),
    };
    logLine(evt);
    broadcast(evt);
  });

  browserContext.on('page', (page) => attachPage(page));

  // Ensure one initial page exists
  const firstPage = browserContext.pages()[0] || (await browserContext.newPage());
  attachPage(firstPage);
}

function findPageId(page) {
  if (!page) return null;
  for (const [id, p] of pages.entries()) if (p === page) return id;
  return null;
}

function attachPage(page) {
  const pageId = String(nextPageId++);
  pages.set(pageId, page);
  try {
    page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS);
  } catch {}
  logLine({ level: 'info', type: 'page:open', pageId, url: page.url() });
  broadcast({ level: 'info', type: 'page:open', pageId, url: page.url() });

  page.on('close', () => {
    logLine({ level: 'info', type: 'page:close', pageId });
    broadcast({ level: 'info', type: 'page:close', pageId });
    pages.delete(pageId);
  });
  page.on('console', (msg) => {
    const evt = {
      level: 'info',
      type: 'page:console',
      pageId,
      text: msg.text(),
      severity: msg.type(),
      timestamp: Date.now(),
    };
    logLine(evt);
    broadcast(evt);
  });
  page.on('pageerror', (err) => {
    const evt = { level: 'error', type: 'page:error', pageId, message: String(err), timestamp: Date.now() };
    logLine(evt);
    broadcast(evt);
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      const evt = { level: 'info', type: 'page:navigation', pageId, url: frame.url(), timestamp: Date.now() };
      logLine(evt);
      broadcast(evt);
    }
  });
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
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

async function handleAction(action, payload) {
  switch (action) {
    case 'newPage':
      return enqueue('global', async () => {
        const page = await browserContext.newPage();
        // If page event didn't attach yet, attach now deterministically
        let id = findPageId(page);
        if (!id) {
          id = String(nextPageId++);
          pages.set(id, page);
          const evt = { level: 'info', type: 'page:open', pageId: id, url: page.url() };
          logLine(evt);
          broadcast(evt);
        }
        return { pageId: id };
      });
    case 'goto': {
      const { pageId, url, waitUntil = 'load', timeoutMs } = payload;
      const page = pages.get(String(pageId));
      if (!page) throw new Error(`Unknown pageId ${pageId}`);
      return enqueue(String(pageId), async () => {
        const evt = { level: 'info', type: 'action:goto', pageId: String(pageId), url };
        logLine(evt);
        broadcast(evt);
        await page.goto(url, { waitUntil, timeout: typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_TIMEOUT_MS });
        return { ok: true, url: page.url() };
      });
    }
    case 'click': {
      const { pageId, selector, options, timeoutMs } = payload;
      const page = pages.get(String(pageId));
      if (!page) throw new Error(`Unknown pageId ${pageId}`);
      return enqueue(String(pageId), async () => {
        const evt = { level: 'info', type: 'action:click', pageId: String(pageId), selector };
        logLine(evt);
        broadcast(evt);
        const merged = { ...(options || {}), timeout: typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_TIMEOUT_MS };
        await page.click(selector, merged);
        return { ok: true };
      });
    }
    case 'waitForSelector': {
      const { pageId, selector, state = 'visible', timeoutMs } = payload;
      const page = pages.get(String(pageId));
      if (!page) throw new Error(`Unknown pageId ${pageId}`);
      return enqueue(String(pageId), async () => {
        const evt = { level: 'info', type: 'action:waitForSelector', pageId: String(pageId), selector, state };
        logLine(evt);
        broadcast(evt);
        await page.waitForSelector(selector, {
          state,
          timeout: typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_TIMEOUT_MS,
        });
        return { ok: true };
      });
    }
    case 'type': {
      const { pageId, selector, text, delay } = payload;
      const page = pages.get(String(pageId));
      if (!page) throw new Error(`Unknown pageId ${pageId}`);
      return enqueue(String(pageId), async () => {
        const evt = { level: 'info', type: 'action:type', pageId: String(pageId), selector, text };
        logLine(evt);
        broadcast(evt);
        await page.type(selector, text, typeof delay === 'number' ? { delay } : undefined);
        return { ok: true };
      });
    }
    case 'fill': {
      const { pageId, selector, value, timeoutMs } = payload;
      const page = pages.get(String(pageId));
      if (!page) throw new Error(`Unknown pageId ${pageId}`);
      return enqueue(String(pageId), async () => {
        const evt = { level: 'info', type: 'action:fill', pageId: String(pageId), selector };
        logLine(evt);
        broadcast(evt);
        await page.fill(selector, value, { timeout: typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_TIMEOUT_MS });
        return { ok: true };
      });
    }
    case 'evaluate': {
      const { pageId, expression, arg } = payload;
      const page = pages.get(String(pageId));
      if (!page) throw new Error(`Unknown pageId ${pageId}`);
      return enqueue(String(pageId), async () => {
        const evt = { level: 'info', type: 'action:evaluate', pageId: String(pageId), expression };
        logLine(evt);
        broadcast(evt);
        // Evaluate the provided expression in the page context.
        // The previous implementation incorrectly called the resolved Promise as a function.
        // Wrap expression in an async IIFE that accepts `arg` and invoke it with `arg` once.
        const evaluator = new Function(
          'arg',
          `return (async (arg) => { ${expression} })(arg);`
        );
        const result = await page.evaluate(evaluator, arg);
        return { ok: true, result };
      });
    }
    case 'screenshot': {
      const { pageId, fullPage } = payload;
      const page = pages.get(String(pageId));
      if (!page) throw new Error(`Unknown pageId ${pageId}`);
      return enqueue(String(pageId), async () => {
        const buf = await page.screenshot({ fullPage: !!fullPage });
        return { ok: true, base64: buf.toString('base64') };
      });
    }
    case 'closePage': {
      const { pageId } = payload;
      const page = pages.get(String(pageId));
      if (!page) throw new Error(`Unknown pageId ${pageId}`);
      return enqueue(String(pageId), async () => {
        await page.close();
        return { ok: true };
      });
    }
    default:
      throw new Error(`Unknown action ${action}`);
  }
}

function listPages() {
  return [...pages.entries()].map(([id, p]) => ({ id, url: p.url(), isClosed: p.isClosed?.() || false }));
}

function handleRequest(req, res) {
  cors(res);
  const { pathname, query } = parseUrl(req.url || '', true);

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
    // SSE
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
        logLine({ level: isTimeout ? 'warn' : 'error', type: isTimeout ? 'api:timeout' : 'api', message });
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
          const onError = (err) => {
            server.off('listening', onListening);
            reject(err);
          };
          const onListening = () => {
            server.off('error', onError);
            resolve();
          };
          server.once('error', onError);
          server.once('listening', onListening);
          server.listen(port, HOST);
        });
        // Success
        return port;
      } catch (err) {
        const code = err && err.code;
        if (code === 'EADDRINUSE' && !strictPort) {
          const nextPort = port + 1;
          logLine({
            level: 'warn',
            type: 'startup',
            message: `Port ${port} in use, trying ${nextPort}`,
          });
          port = nextPort;
          continue;
        }
        // Re-throw for non-retryable or strict
        throw err;
      }
    }
    throw new Error(`Unable to bind on range starting ${startPort} after ${maxAttempts} attempts`);
  }

  try {
    PORT = await listenWithRetry(PORT);
    const msg = { level: 'info', type: 'startup', message: `Server listening on http://${HOST}:${PORT}` };
    logLine(msg);
    broadcast(msg);
  } catch (e) {
    const fatal = {
      level: 'fatal',
      type: 'startup',
      message: `Failed to bind: ${e && e.code ? e.code + ' ' : ''}${String(e)}`,
    };
    logLine(fatal);
    process.exit(1);
  }

  async function gracefulExit(signal) {
    logLine({ level: 'info', type: 'shutdown', message: `${signal} received, closing` });
    try {
      await browserContext?.close();
    } catch {}
    try {
      server.close?.();
    } catch {}
    process.exit(0);
  }

  process.on('SIGINT', () => void gracefulExit('SIGINT'));
  process.on('SIGTERM', () => void gracefulExit('SIGTERM'));
}

main().catch((e) => {
  logLine({ level: 'fatal', type: 'startup', message: String(e) });
  process.exit(1);
});
