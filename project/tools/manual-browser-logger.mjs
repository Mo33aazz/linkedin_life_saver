#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const logDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const logfile = path.join(logDir, `manual-session-${ts}.ndjson`);
const commandsFile = path.join(logDir, `manual-commands-${ts}.ndjson`);
const userDataDir = process.env.USER_DATA_DIR || path.join(logDir, `chromium-profile-${ts}`);

const append = (obj) => {
  try {
    fs.appendFileSync(logfile, JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n');
  } catch {}
};

async function bindPage(page) {
  await page.exposeBinding('__logEvent', (_source, payload) => {
    append({ type: 'dom_event', url: page.url(), ...payload });
  });
  await page.addInitScript(() => {
    const describe = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : {};
      const text = (el.innerText || el.value || '').toString().trim().slice(0, 120);
      const attrs = ['id','name','type','role','placeholder'].reduce((a,k)=>{ try{ const v=el.getAttribute(k); if(v!=null) a[k]=v }catch{} return a; },{});
      return {
        tag: el.tagName,
        id: el.id || undefined,
        classes: el.className || undefined,
        attrs,
        text,
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : undefined,
      };
    };
    const send = (payload) => { try { window.__logEvent(payload); } catch {} };
    window.addEventListener('click', (e) => send({ ev: 'click', x: e.clientX, y: e.clientY, button: e.button, target: describe(e.target) }), true);
    window.addEventListener('input', (e) => {
      const t = e.target;
      const isPw = t && (t.type === 'password' || (t.getAttribute && /passw/i.test(String(t.getAttribute('name')||''))));
      const val = !isPw && t && (t.value !== undefined ? String(t.value).slice(0,200) : undefined);
      send({ ev: 'input', target: describe(t), valuePreview: val, redacted: !!isPw });
    }, true);
    window.addEventListener('change', (e) => {
      const t = e.target;
      const isPw = t && (t.type === 'password' || (t.getAttribute && /passw/i.test(String(t.getAttribute('name')||''))));
      const val = !isPw && t && (t.value !== undefined ? String(t.value).slice(0,200) : undefined);
      send({ ev: 'change', target: describe(t), valuePreview: val, redacted: !!isPw });
    }, true);
    window.addEventListener('keydown', (e) => {
      const ae = document.activeElement;
      const isPw = ae && (ae.type === 'password' || (ae.getAttribute && /passw/i.test(String(ae.getAttribute('name')||''))));
      send({ ev: 'key', key: isPw ? undefined : e.key, code: e.code, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey, shift: e.shiftKey, redacted: !!isPw });
    }, true);
    window.addEventListener('submit', (e) => send({ ev: 'submit', target: describe(e.target) }), true);
    window.addEventListener('selectionchange', () => { const sel = document.getSelection && document.getSelection(); const text = sel ? String(sel.toString()).slice(0,200) : undefined; send({ ev: 'select', text }); }, true);
    window.addEventListener('hashchange', () => send({ ev: 'hashchange', url: location.href }), true);
    document.addEventListener('visibilitychange', () => send({ ev: 'visibility', state: document.visibilityState }), true);
    send({ ev: 'init', url: location.href, title: document.title });
  });
  append({ type: 'page_open', url: page.url() });
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) append({ type: 'nav', url: frame.url() }); });
  page.on('dialog', (d) => append({ type: 'dialog', kind: d.type(), message: d.message() }));
  page.on('console', (msg) => append({ type: 'console', level: msg.type(), text: msg.text() }));
  page.on('filechooser', (fc) => append({ type: 'filechooser', isMultiple: fc.isMultiple() }));
}

(async () => {
  const ua = process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
  const commonLaunch = {
    headless: false,
    viewport: null,
    devtools: true,
    userAgent: ua,
    locale: process.env.LOCALE || 'en-US',
    timezoneId: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--password-store=basic',
      '--use-mock-keychain',
    ],
    permissions: [],
    acceptDownloads: true,
  };

  let context;
  try {
    // Prefer real Chrome if available
    context = await chromium.launchPersistentContext(userDataDir, { ...commonLaunch, channel: process.env.PW_CHANNEL || 'chrome' });
  } catch (e) {
    // Fallback to bundled Chromium
    context = await chromium.launchPersistentContext(userDataDir, commonLaunch);
  }

  append({ type: 'session_start', logfile, userDataDir });

  // Stealth-ish patches to reduce automation signals
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = window.chrome || { runtime: {} };
      const originalQuery = window.Notification && Notification.requestPermission;
      if (navigator.permissions && navigator.permissions.query) {
        const original = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = (parameters) =>
          parameters && parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : original(parameters);
      }
      const languages = navigator.languages;
      Object.defineProperty(navigator, 'languages', { get: () => languages && languages.length ? languages : ['en-US', 'en'] });
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' });
      // Plugins stub
      Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4] });
      // WebGL vendor/renderer hints
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.'; // UNMASKED_VENDOR_WEBGL
        if (parameter === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
        return getParameter.call(this, parameter);
      };
    } catch {}
  });

  context.on('page', bindPage);
  for (const p of context.pages()) bindPage(p).catch(()=>{});

  context.on('request', (req) => append({ type: 'request', method: req.method(), url: req.url(), resourceType: req.resourceType() }));
  context.on('response', async (res) => {
    let size; try { const headers = await res.allHeaders(); size = Number(headers['content-length']) || undefined; } catch {}
    append({ type: 'response', status: res.status(), url: res.url(), size });
  });
  context.on('requestfailed', (req) => append({ type: 'request_failed', url: req.url(), failure: req.failure() }));
  context.on('download', (d) => append({ type: 'download', url: d.url(), suggestedFilename: d.suggestedFilename() }));
  context.on('websocket', (ws) => {
    append({ type: 'websocket', url: ws.url() });
    ws.on('framesent', (e) => append({ type: 'ws_framesent', length: e.payloadData?.length }));
    ws.on('framereceived', (e) => append({ type: 'ws_framereceived', length: e.payloadData?.length }));
    ws.on('close', () => append({ type: 'ws_close', url: ws.url() }));
  });

  const page = context.pages()[0] || await context.newPage();
  if (process.env.START_URL) { try { await page.goto(process.env.START_URL); } catch {}
  }

  context.on('close', () => { append({ type: 'session_end' }); process.exit(0); });
  process.on('SIGINT', async () => { append({ type: 'signal', sig: 'SIGINT' }); await context.close(); });
  process.on('SIGTERM', async () => { append({ type: 'signal', sig: 'SIGTERM' }); await context.close(); });

  // Command processor: poll the commands file for new lines
  let cmdFd = fs.openSync(commandsFile, 'a+');
  let cmdPos = 0;
  const getActivePage = () => (context.pages()[context.pages().length - 1] || context.pages()[0]);

  async function handleCommand(cmd) {
    const p = getActivePage() || (await context.newPage());
    try {
      if (cmd.cmd === 'navigate' && cmd.url) {
        append({ type: 'action', name: 'navigate', url: cmd.url });
        await p.goto(cmd.url, { waitUntil: 'domcontentloaded' });
        append({ type: 'action_done', name: 'navigate', url: cmd.url });
      } else if (cmd.cmd === 'click_selector' && cmd.selector) {
        append({ type: 'action', name: 'click_selector', selector: cmd.selector });
        await p.locator(cmd.selector).first().click({ timeout: cmd.timeout || 10000 });
        append({ type: 'action_done', name: 'click_selector', selector: cmd.selector });
      } else if (cmd.cmd === 'linkedin_like_post' && cmd.query) {
        append({ type: 'action', name: 'linkedin_like_post', query: cmd.query });
        if (!/linkedin\.com/.test(p.url())) {
          await p.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' }).catch(()=>{});
        }
        // Try to find an article containing the query text
        const article = p.locator('article').filter({ hasText: cmd.query }).first();
        await article.waitFor({ timeout: cmd.timeout || 15000 });
        // Prefer aria-label Like within the article
        const likeBtn = article.locator('button[aria-pressed][aria-label*="Like" i], button[aria-label*="Like" i], [role="button"]:has-text("Like")').first();
        // If already liked, aria-pressed might be true; try to ensure it's not already liked
        const pressed = await likeBtn.getAttribute('aria-pressed').catch(()=>null);
        if (pressed === 'true') {
          append({ type: 'action_skipped', name: 'linkedin_like_post', reason: 'already_liked' });
        } else {
          await likeBtn.click({ timeout: cmd.timeout || 10000 });
          // Wait for state to reflect
          await p.waitForTimeout(500);
          append({ type: 'action_done', name: 'linkedin_like_post', query: cmd.query });
        }
      }
    } catch (e) {
      append({ type: 'action_error', name: cmd.cmd, message: e.message });
    }
  }

  setInterval(() => {
    try {
      const stats = fs.fstatSync(cmdFd);
      if (stats.size > cmdPos) {
        const buf = Buffer.alloc(stats.size - cmdPos);
        fs.readSync(cmdFd, buf, 0, buf.length, cmdPos);
        cmdPos = stats.size;
        const lines = buf.toString('utf8').split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          try { const cmd = JSON.parse(line); handleCommand(cmd); } catch {}
        }
      }
    } catch {}
  }, 500);

  console.log(JSON.stringify({ logfile, userDataDir, commandsFile }));
})();
