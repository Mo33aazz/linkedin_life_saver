import { readFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';

async function globalTeardown() {
  try {
    const pidFile = resolve(
      process.cwd(),
      'test-results',
      'shared-browser.pid'
    );
    const pidStr = readFileSync(pidFile, 'utf-8').trim();
    const pid = Number(pidStr);
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {}
    }
    try {
      unlinkSync(pidFile);
    } catch {}
  } catch {
    // ignore
  }
}

export default globalTeardown;
