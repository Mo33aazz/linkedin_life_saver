// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  timeout: 60 * 1000, // Increased from 30 seconds to 60 seconds
  expect: {
    timeout: 10000, // Increased from 5 seconds to 10 seconds
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1, // Allow one retry for local runs to handle flakiness
  workers: 1, // Force a single worker to prevent parallel requests to LinkedIn
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Add default navigation timeout and a modest action timeout
    navigationTimeout: 60000,
    actionTimeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});