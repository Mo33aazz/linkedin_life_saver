import { test, expect, Page } from '@playwright/test';
import {
  UIState,
  LogEntry,
  ExtensionMessage,
  Comment,
} from '../../src/shared/types';

const LINKEDIN_POST_URL =
  'https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/';

/**
 * A helper function to dispatch a mock chrome.runtime message into the page context.
 * This simulates a message coming from the service worker.
 * @param page The Playwright page object.
 * @param message The message to dispatch, conforming to the ExtensionMessage type.
 */
async function dispatchChromeMessage(page: Page, message: ExtensionMessage) {
  await page.evaluate((msg) => {
    // This code runs in the browser's context.
    // It finds the listener set up by the UI's Zustand store and invokes it directly.
    if (window.chrome && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.getListeners().forEach((listener) => {
        // The listener function expects (message, sender, sendResponse)
        listener(msg, {}, () => {});
      });
    }
  }, message);
}

// Helper to create a mock comment object to avoid repetition.
const createMockComment = (overrides: Partial<Comment>): Comment => ({
  commentId: `id-${Math.random()}`,
  text: 'A mock comment text.',
  ownerProfileUrl: '/in/mock-user/',
  timestamp: new Date().toISOString(),
  type: 'top-level',
  connected: false,
  threadId: '',
  likeStatus: '',
  replyStatus: '',
  dmStatus: '',
  attempts: { like: 0, reply: 0, dm: 0 },
  lastError: '',
  pipeline: { queuedAt: '', likedAt: '', repliedAt: '', dmAt: '' },
  ...overrides,
});

test.describe('Real-time UI Update Simulation', () => {
  test('should update UI components in response to mock events', async ({
    page,
  }) => {
    // 1. ARRANGE: Navigate to a target page and wait for the UI to be injected.
    await page.goto(LINKEDIN_POST_URL);
    const sidebar = page.locator('div.sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // 2. TEST COUNTERS: Dispatch a STATE_UPDATE for stats and verify counters.
    const statsUpdatePayload: ExtensionMessage = {
      type: 'STATE_UPDATE',
      payload: {
        isInitializing: false, // This is crucial to remove skeleton loaders
        stats: {
          totalTopLevelNoReplies: 256,
          userTopLevelNoReplies: 8,
        },
      },
    };
    await dispatchChromeMessage(page, statsUpdatePayload);

    // ASSERT: Check that the counter values have updated.
    // Playwright's web-first assertions will wait for the animation to complete.
    const counterValues = sidebar.locator('.counter-value');
    await expect(counterValues.first()).toHaveText('256');
    await expect(counterValues.last()).toHaveText('8');

    // 3. TEST PIPELINE PROGRESS: Dispatch a STATE_UPDATE with comments.
    const pipelineUpdatePayload: ExtensionMessage = {
      type: 'STATE_UPDATE',
      payload: {
        comments: [
          createMockComment({
            commentId: 'c1',
            ownerProfileUrl: '/in/author-one/',
            text: 'This comment is fully complete.',
            likeStatus: 'DONE',
            replyStatus: 'DONE',
            dmStatus: 'DONE',
          }),
          createMockComment({
            commentId: 'c2',
            ownerProfileUrl: '/in/author-two/',
            text: 'This comment has a failed like step.',
            likeStatus: 'FAILED',
            replyStatus: '',
          }),
          createMockComment({
            commentId: 'c3',
            ownerProfileUrl: '/in/author-three/',
            text: 'This comment is currently being replied to.',
            likeStatus: 'DONE',
            replyStatus: '', // This makes the 'Replied' step active
          }),
        ],
      },
    };
    await dispatchChromeMessage(page, pipelineUpdatePayload);

    // ASSERT: Check that the correct number of comment rows are rendered.
    const commentRows = sidebar.locator('.comment-row');
    await expect(commentRows).toHaveCount(3);

    // ASSERT: Check the stepper statuses for each comment row.
    const firstRow = commentRows.nth(0);
    await expect(firstRow.locator('.step-item').nth(1)).toHaveClass(/step-complete/); // Liked
    await expect(firstRow.locator('.step-item').nth(2)).toHaveClass(/step-complete/); // Replied
    await expect(firstRow.locator('.step-item').nth(3)).toHaveClass(/step-complete/); // DM Sent

    const secondRow = commentRows.nth(1);
    await expect(secondRow.locator('.step-item').nth(1)).toHaveClass(/step-failed/); // Liked
    await expect(secondRow.locator('.step-item').nth(2)).toHaveClass(/step-pending/); // Replied

    const thirdRow = commentRows.nth(2);
    await expect(thirdRow.locator('.step-item').nth(1)).toHaveClass(/step-complete/); // Liked
    await expect(thirdRow.locator('.step-item').nth(2)).toHaveClass(/step-active/); // Replied
    await expect(thirdRow.locator('.step-item').nth(3)).toHaveClass(/step-pending/); // DM Sent

    // 4. TEST LOGS PANEL: Dispatch a LOG_ENTRY message.
    const logEntry: LogEntry = {
      timestamp: Date.now(),
      level: 'WARN',
      message: 'This is a simulated warning log message.',
    };
    const logMessagePayload: ExtensionMessage = {
      type: 'LOG_ENTRY',
      payload: logEntry,
    };
    await dispatchChromeMessage(page, logMessagePayload);

    // ASSERT: Check that the new log entry is visible in the logs panel.
    const logContainer = sidebar.locator('.log-container');
    const newLogElement = logContainer.locator('.log-entry', {
      hasText: 'This is a simulated warning log message.',
    });
    
    await expect(newLogElement).toBeVisible();
    await expect(newLogElement).toHaveClass(/log-entry--warn/);
    await expect(newLogElement.locator('.log-level')).toHaveText('WARN');
  });
});