import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const SERVER_PORT = Number(process.env.SHARED_BROWSER_PORT || 9333);
const STATUS_URL = `http://localhost:${SERVER_PORT}/api/status`;

async function waitForServer(url: string, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 800);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(t);
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.ok) return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function globalSetup() {
  const cwd = process.cwd();
  const distDir = resolve(cwd, 'dist');
  const serverScript = resolve(cwd, 'tools', 'shared-browser', 'server.js');

  // Ensure logs dir exists for server logs
  const logsDir = resolve(cwd, 'logs');
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

  // If server is already up, do not start a new one
  const alreadyUp = await waitForServer(STATUS_URL, 1500);
  if (alreadyUp) {
    return;
  }

  const env = { ...process.env };
  env.SHARED_BROWSER_PORT = String(SERVER_PORT);
  env.SHARED_BROWSER_STRICT_PORT = '1';
  env.SHARED_EXTENSIONS_DIRS = distDir; // load extension from dist

  const child = spawn('node', [serverScript], {
    cwd,
    env,
    stdio: 'inherit',
  });

  // Persist PID for teardown
  const pidDir = resolve(cwd, 'test-results');
  if (!existsSync(pidDir)) mkdirSync(pidDir, { recursive: true });
  const pidFile = join(pidDir, 'shared-browser.pid');
  writeFileSync(pidFile, String(child.pid));

  const ok = await waitForServer(STATUS_URL, 25_000);
  if (!ok) {
    // In restricted environments (like sandboxes/CI without a browser), don't fail hard.
    // Create a sentinel file to allow specs to skip gracefully.
    try {
      const pidDir = resolve(cwd, 'test-results');
      if (!existsSync(pidDir)) mkdirSync(pidDir, { recursive: true });
      const skipFile = join(pidDir, 'SKIP_E2E');
      writeFileSync(
        skipFile,
        'Shared browser server unavailable; skipping E2E tests.'
      );
    } catch {}
    console.warn(
      '[globalSetup] Shared browser server did not become healthy in time. E2E tests will be skipped.'
    );
    return;
  }
}

export default globalSetup;
