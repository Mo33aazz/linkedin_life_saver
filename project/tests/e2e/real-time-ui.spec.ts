import { test, expect, Page } from '@playwright/test';
import { ExtensionMessage, Comment, LogEntry, UIState } from '../../src/shared/types';

const LINKEDIN_POST_URL = 'https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/';

// Helper to dispatch messages to the UI's test hook
async function dispatchMessage(page: Page, message: ExtensionMessage) {
  await page.evaluate((msg) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__E2E_TEST_DISPATCH_MESSAGE__(msg);
  }, message);
}

// Helper to create mock comment data
const createMockComment = (overrides: Partial<Comment>): Comment => ({
  commentId: `urn:li:comment:(activity:123,${Math.random()})`,
  text: `This is a mock comment. ${Math.random()}`,
  ownerProfileUrl: 'https://www.linkedin.com/in/mockuser/',
  timestamp: new Date().toISOString(),
  type: 'top-level',
  connected: false,
  threadId: '',
  likeStatus: '',
  replyStatus: '',
  dmStatus: '',
  attempts: { like: 0, reply: 0, dm: 0 },
  lastError: '',
  pipeline: { queuedAt: new Date().toISOString(), likedAt: '', repliedAt: '', dmAt: '' },
  ...overrides,
});

test.describe('Real-time UI Updates E2E Test', () => {
  test('should update UI components when background events are simulated', async ({
    page,
  }) => {
    // 1. ARRANGE: Navigate to the target page and wait for the UI to be injected.
    await page.goto(LINKEDIN_POST_URL);
    const sidebar = page.locator('div.sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // --- TEST 1: Live Counters Update ---
    await test.step('should update live counters', async () => {
      const stateUpdate: Partial<UIState> = {
        isInitializing: false, // Ensure skeleton loaders are gone
        stats: { totalTopLevelNoReplies: 99, userTopLevelNoReplies: 15 },
      };
      await dispatchMessage(page, { type: 'STATE_UPDATE', payload: stateUpdate });

      const counters = sidebar.locator('.counter-value');
      await expect(counters.first()).toHaveText('99');
      await expect(counters.last()).toHaveText('15');
    });

    // --- TEST 2: Pipeline Progress Update ---
    await test.step('should update pipeline progress view', async () => {
      const mockComments: Comment[] = [
        createMockComment({
          ownerProfileUrl: 'https://www.linkedin.com/in/user-one/',
          text: 'First comment, liked, now replying.',
          likeStatus: 'DONE',
          replyStatus: '', // This makes 'Replied' the active step
        }),
        createMockComment({
          ownerProfileUrl: 'https://www.linkedin.com/in/user-two/',
          text: 'Second comment, reply failed.',
          likeStatus: 'DONE',
          replyStatus: 'FAILED',
        }),
        createMockComment({
            ownerProfileUrl: 'https://www.linkedin.com/in/user-three/',
            text: 'Third comment, fully processed.',
            likeStatus: 'DONE',
            replyStatus: 'DONE',
            dmStatus: 'DONE',
        }),
      ];

      const stateUpdate: Partial<UIState> = { comments: mockComments };
      await dispatchMessage(page, { type: 'STATE_UPDATE', payload: stateUpdate });

      const commentRows = sidebar.locator('.comment-row');
      await expect(commentRows).toHaveCount(3);

      // Assert state of the first comment's stepper
      const firstRowSteps = commentRows.first().locator('.step-item');
      await expect(firstRowSteps.nth(0)).toHaveClass(/step-complete/); // Queued
      await expect(firstRowSteps.nth(1)).toHaveClass(/step-complete/); // Liked
      await expect(firstRowSteps.nth(2)).toHaveClass(/step-active/);   // Replied
      await expect(firstRowSteps.nth(3)).toHaveClass(/step-pending/);  // DM Sent

      // Assert state of the second comment's stepper
      const secondRowSteps = commentRows.nth(1).locator('.step-item');
      await expect(secondRowSteps.nth(1)).toHaveClass(/step-complete/); // Liked
      await expect(secondRowSteps.nth(2)).toHaveClass(/step-failed/);   // Replied

      // Assert state of the third comment's stepper
      const thirdRowSteps = commentRows.nth(2).locator('.step-item');
      await expect(thirdRowSteps.nth(3)).toHaveClass(/step-complete/); // DM Sent
    });

    // --- TEST 3: Logs Panel Update ---
    await test.step('should update logs panel', async () => {
      const logEntry: LogEntry = {
        timestamp: Date.now(),
        level: 'ERROR',
        message: 'Simulated critical failure from background.',
      };
      await dispatchMessage(page, { type: 'LOG_ENTRY', payload: logEntry });

      const lastLog = sidebar.locator('.log-entry').last();
      await expect(lastLog).toBeVisible();
      await expect(lastLog).toHaveClass(/log-entry--error/);
      await expect(lastLog.locator('.log-message')).toHaveText(logEntry.message);

      const infoLogEntry: LogEntry = {
        timestamp: Date.now(),
        level: 'INFO',
        message: 'This is an informational message.',
      };
      await dispatchMessage(page, { type: 'LOG_ENTRY', payload: infoLogEntry });
      const newLastLog = sidebar.locator('.log-entry').last();
      await expect(newLastLog).toHaveClass(/log-entry--info/);
      await expect(newLastLog.locator('.log-message')).toHaveText(infoLogEntry.message);
    });
  });
});