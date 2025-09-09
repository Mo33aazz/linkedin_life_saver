// Detect an already-running shared browser server and run Playwright accordingly.
// - If http://localhost:9333/api/status responds with ok:true, reuse it.
// - Otherwise, let Playwright start the server.

import { spawn } from 'child_process';

const STATUS_URL = process.env.PWB_STATUS_URL || 'http://localhost:9333/api/status';
const PLAYWRIGHT_BIN = './node_modules/.bin/playwright';
const CONFIG_PATH = 'tests/e2e/playwright.config.ts';

async function isServerUp(url) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 800);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return Boolean(data && data.ok);
  } catch {
    return false;
  }
}

async function killServerOnPort(url) {
  const u = new URL(url);
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  const cmd = process.platform === 'darwin'
    ? `lsof -ti tcp:${port} | xargs -r kill`
    : `bash -lc 'lsof -ti tcp:${port} -sTCP:LISTEN | xargs -r kill'`;
  return new Promise((resolve) => {
    const proc = spawn(cmd, { shell: true, stdio: 'ignore' });
    proc.on('exit', () => resolve());
    proc.on('error', () => resolve());
  });
}

async function main() {
  const serverUp = await isServerUp(STATUS_URL);
  const env = { ...process.env };
  if (serverUp) {
    env.PLAYWRIGHT_REUSE_SERVER = '1';
    console.log(`[e2e] Detected server at ${STATUS_URL}; reusing existing instance.`);
  } else {
    env.PLAYWRIGHT_REUSE_SERVER = env.PLAYWRIGHT_REUSE_SERVER || '0';
    console.log(`[e2e] No server at ${STATUS_URL}; Playwright will start it.`);
  }

  const child = spawn(PLAYWRIGHT_BIN, ['test', '-c', CONFIG_PATH], {
    stdio: 'inherit',
    env,
  });

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}

main().catch((err) => {
  console.error('[e2e] Runner failed:', err?.stack || String(err));
  process.exit(1);
});
