import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    actionTimeout: 60_000,
    navigationTimeout: 60_000,
    viewport: { width: 1280, height: 800 },
  },
  globalSetup: './tests/e2e/setup/globalSetup.ts',
  globalTeardown: './tests/e2e/setup/globalTeardown.ts',
});

