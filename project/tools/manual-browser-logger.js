#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const logDir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const logfile = path.join(logDir, `manual-session-${ts}.ndjson`);
  const log = (obj) => {
    try {
      fs.appendFileSync(logfile, JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n');
    } catch (e) {
      // best-effort
    }
  };

  // Launch persistent context to preserve session/profile
  const userDataDir = path.join(logDir, `chromium-profile-${ts}`);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-blink-features=AutomationControlled',
    ],
    viewport: null,
    devtools: true,
  });

  log({ type: 'session_start', logfile, userDataDir });

  const bindPage = async (page) => {
    // Send events from page to Node
    await page.exposeBinding('__logEvent', (source, payload) => {
      log({ type: 'dom_event', pageId: page._guid || page.guid || undefined, url: page.url(), ...payload });
    });

    // Inject listeners for clicks, inputs, changes, submits, key presses
    await page.addInitScript(() => {
      const describe = (el) => {
        if (!el) return null;
        const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : {};
        const text = (el.innerText || el.value || '').toString().trim().slice(0, 120);
        const attrs = ['id','name','type','role','placeholder','value'].reduce((a,k)=>{ if(el.getAttribute&&el.getAttribute(k)!=null) a[k]=el.getAttribute(k); return a; },{});
        return {
          tag: el.tagName,
          id: el.id || undefined,
          classes: el.className || undefined,
          attrs,
          text,
          rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : undefined,
          selector: (()=>{ try{ return (window).getComputedStyle ? undefined : undefined }catch{ return undefined } })()
        };
      };
      const send = (payload) => {
        try { window.__logEvent(payload); } catch (e) { /* ignore */ }
      };
      const onClick = (e) => {
        send({ ev: 'click', x: e.clientX, y: e.clientY, button: e.button, target: describe(e.target) });
      };
      const onInput = (e) => {
        const t = e.target;
        const val = t && (t.value !== undefined ? String(t.value).slice(0, 200) : undefined);
        send({ ev: 'input', target: describe(t), valuePreview: val });
      };
      const onChange = (e) => {
        const t = e.target;
        const val = t && (t.value !== undefined ? String(t.value).slice(0, 200) : undefined);
        send({ ev: 'change', target: describe(t), valuePreview: val });
      };
      const onKey = (e) => {
        send({ ev: 'key', key: e.key, code: e.code, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey, shift: e.shiftKey });
      };
      const onSubmit = (e) => {
        send({ ev: 'submit', target: describe(e.target) });
      };
      const onSelect = () => {
        const sel = document.getSelection && document.getSelection();
        const text = sel ? String(sel.toString()).slice(0, 200) : undefined;
        send({ ev: 'select', text });
      };
      const onHashChange = () => send({ ev: 'hashchange', url: location.href });
      const onVisibility = () => send({ ev: 'visibility', state: document.visibilityState });

      window.addEventListener('click', onClick, true);
      window.addEventListener('input', onInput, true);
      window.addEventListener('change', onChange, true);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('submit', onSubmit, true);
      window.addEventListener('selectionchange', onSelect, true);
      window.addEventListener('hashchange', onHashChange, true);
      document.addEventListener('visibilitychange', onVisibility, true);

      // Initial marker
      send({ ev: 'init', url: location.href, title: document.title });
    });

    // After listeners installed, mark page open
    log({ type: 'page_open', url: page.url() });

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        log({ type: 'nav', url: frame.url() });
      }
    });
    page.on('dialog', (d) => log({ type: 'dialog', kind: d.type(), message: d.message() }));
    page.on('console', (msg) => log({ type: 'console', level: msg.type(), text: msg.text() }));
    page.on('filechooser', (fc) => log({ type: 'filechooser', isMultiple: fc.isMultiple() }));
  };

  context.on('page', bindPage);

  // Network + downloads
  context.on('request', (req) => log({ type: 'request', method: req.method(), url: req.url(), resourceType: req.resourceType() }));
  context.on('response', async (res) => {
    let size;
    try { const headers = await res.allHeaders(); size = Number(headers['content-length']) || undefined; } catch {}
    log({ type: 'response', status: res.status(), url: res.url(), size });
  });
  context.on('requestfailed', (req) => log({ type: 'request_failed', url: req.url(), failure: req.failure() }));
  context.on('download', (d) => log({ type: 'download', url: d.url(), suggestedFilename: d.suggestedFilename() }));
  context.on('websocket', (ws) => {
    log({ type: 'websocket', url: ws.url() });
    ws.on('framesent', (e) => log({ type: 'ws_framesent', length: e.payloadData?.length }));
    ws.on('framereceived', (e) => log({ type: 'ws_framereceived', length: e.payloadData?.length }));
    ws.on('close', () => log({ type: 'ws_close', url: ws.url() }));
  });

  // Open a starter page
  const page = context.pages()[0] || await context.newPage();
  if (process.env.START_URL) {
    await page.goto(process.env.START_URL).catch(()=>{});
  }

  // Keep alive until SIGINT/SIGTERM or window close
  context.on('close', () => {
    log({ type: 'session_end' });
    process.exit(0);
  });

  process.on('SIGINT', async () => { log({ type: 'signal', sig: 'SIGINT' }); await context.close(); });
  process.on('SIGTERM', async () => { log({ type: 'signal', sig: 'SIGTERM' }); await context.close(); });

  // Print where the log is for convenience
  console.log(JSON.stringify({ logfile, userDataDir }));
})();
