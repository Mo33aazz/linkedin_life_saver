import { test, expect, Page } from '@playwright/test';
import { ExtensionMessage, Comment } from '../../src/shared/types';

/**
 * Helper function to dispatch a message to the UI's store, simulating a
 * message from the background service worker. This relies on a test hook
 * exposed on the window object in development builds.
 * @param page The Playwright page object.
 * @param message The message payload to dispatch.
 */
async function dispatchMessage(page: Page, message: ExtensionMessage) {
  await page.evaluate((msg) => {
    // This function is exposed on the window object in development mode for E2E testing.
    // See: src/ui/store/index.ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__E2E_TEST_DISPATCH_MESSAGE__(msg);
  }, message);
}

// --- Mock Data ---

const mockComment1: Comment = {
  commentId: 'c1',
  text: 'This is the first test comment, which was successfully liked.',
  ownerProfileUrl: '/in/test-author-1/',
  timestamp: new Date().toISOString(),
  type: 'top-level',
  connected: false,
  threadId: '',
  likeStatus: 'DONE',
  replyStatus: '',
  dmStatus: '',
  attempts: { like: 1, reply: 0, dm: 0 },
  lastError: '',
  pipeline: {
    queuedAt: new Date().toISOString(),
    likedAt: new Date().toISOString(),
    repliedAt: '',
    dmAt: '',
  },
};

const mockComment2: Comment = {
  commentId: 'c2',
  text: 'This is the second test comment, where the like action failed.',
  ownerProfileUrl: '/in/test-author-2/',
  timestamp: new Date().toISOString(),
  type: 'top-level',
  connected: true,
  threadId: 't2',
  likeStatus: 'FAILED',
  replyStatus: '',
  dmStatus: '',
  attempts: { like: 3, reply: 0, dm: 0 },
  lastError: 'Could not find like button',
  pipeline: { queuedAt: new Date().toISOString(), likedAt: '', repliedAt: '', dmAt: '' },
};

// --- Test Suite ---

test.describe('Real-time UI Updates', () => {
  test.beforeEach(async ({ page }) => {
    // A real LinkedIn post URL is needed for the content script to activate.
    await page.goto(
      'https://www.linkedin.com/feed/update/urn:li:activity:7197578443311341568/',
      { waitUntil: 'networkidle' }
    );

    // Wait for the UI to be injected by looking for the sidebar host element.
    const sidebarHost = page.locator('div.sidebar');
    await expect(sidebarHost).toBeVisible({ timeout: 15000 });

    // Then, wait for the main header to be visible inside the shadow DOM.
    await expect(
      sidebarHost.locator('h1:has-text("LinkedIn Engagement Assistant")')
    ).toBeVisible({ timeout: 10000 });
  });

  test('should update live counters on STATE_UPDATE', async ({ page }) => {
    const mockStateUpdate: ExtensionMessage = {
      type: 'STATE_UPDATE',
      payload: {
        isInitializing: false,
        stats: {
          totalTopLevelNoReplies: 123,
          userTopLevelNoReplies: 45,
        },
      },
    };

    await dispatchMessage(page, mockStateUpdate);

    const totalCounter = page.locator(
      '.counter-item:has-text("Total Top-Level") .counter-value'
    );
    const userCounter = page.locator(
      '.counter-item:has-text("Your Top-Level") .counter-value'
    );

    // Playwright's web-first assertions automatically wait for the animated counter.
    await expect(totalCounter).toHaveText('123');
    await expect(userCounter).toHaveText('45');
  });

  test('should update pipeline progress view on STATE_UPDATE', async ({
    page,
  }) => {
    const mockStateUpdate: ExtensionMessage = {
      type: 'STATE_UPDATE',
      payload: {
        isInitializing: false,
        comments: [mockComment1, mockComment2],
      },
    };

    await dispatchMessage(page, mockStateUpdate);

    // --- Verify Comment 1 (Liked successfully) ---
    const commentRow1 = page.locator('.comment-row:has-text("test-author-1")');
    await expect(commentRow1).toBeVisible();
    const stepperItems1 = commentRow1.locator('.step-item');

    // Expected states: Queued -> complete, Liked -> complete, Replied -> active, DM Sent -> pending
    await expect(stepperItems1.nth(0)).toHaveClass(/step-complete/); // Queued
    await expect(stepperItems1.nth(1)).toHaveClass(/step-complete/); // Liked
    await expect(stepperItems1.nth(2)).toHaveClass(/step-active/); // Replied
    await expect(stepperItems1.nth(3)).toHaveClass(/step-pending/); // DM Sent

    // --- Verify Comment 2 (Like failed) ---
    const commentRow2 = page.locator('.comment-row:has-text("test-author-2")');
    await expect(commentRow2).toBeVisible();
    const stepperItems2 = commentRow2.locator('.step-item');

    // Expected states: Queued -> complete, Liked -> failed, Replied -> pending, DM Sent -> pending
    await expect(stepperItems2.nth(0)).toHaveClass(/step-complete/); // Queued
    await expect(stepperItems2.nth(1)).toHaveClass(/step-failed/); // Liked
    await expect(stepperItems2.nth(2)).toHaveClass(/step-pending/); // Replied
    await expect(stepperItems2.nth(3)).toHaveClass(/step-pending/); // DM Sent
  });

  test('should add new entries to the logs panel on LOG_ENTRY', async ({
    page,
  }) => {
    const infoLog: ExtensionMessage = {
      type: 'LOG_ENTRY',
      payload: {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Pipeline processing started.',
      },
    };
    const errorLog: ExtensionMessage = {
      type: 'LOG_ENTRY',
      payload: {
        timestamp: new Date(Date.now() + 1).toISOString(), // ensure different timestamp
        level: 'ERROR',
        message: 'Failed to generate AI reply: API key invalid.',
      },
    };

    // Dispatch logs one by one
    await dispatchMessage(page, infoLog);
    await dispatchMessage(page, errorLog);

    // Verify info log
    const infoLogLocator = page.locator(
      '.log-entry:has-text("Pipeline processing started.")'
    );
    await expect(infoLogLocator).toBeVisible();
    await expect(infoLogLocator).toHaveClass(/log-entry--info/);

    // Verify error log
    const errorLogLocator = page.locator(
      '.log-entry:has-text("Failed to generate AI reply: API key invalid.")'
    );
    await expect(errorLogLocator).toBeVisible();
    await expect(errorLogLocator).toHaveClass(/log-entry--error/);
  });
});