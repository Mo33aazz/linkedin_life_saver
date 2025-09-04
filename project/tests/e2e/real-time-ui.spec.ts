import { test, expect } from './fixtures';
import type { UIState, LogEntry, Comment, ExtensionMessage } from '../../src/shared/types';

// Helper function to dispatch messages to the UI's store via the E2E test hook
const dispatchMessage = async (page, message: ExtensionMessage) => {
  await page.evaluate((msg) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__E2E_TEST_DISPATCH_MESSAGE__(msg);
  }, message);
};

test.describe('Real-time UI Updates', () => {
  const postUrl = 'https://www.linkedin.com/feed/update/urn:li:activity:7368619407989760000/';

  test.beforeEach(async ({ page }) => {
    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    // Wait for the sidebar root element to be injected into the DOM
    await page.waitForSelector('#linkedin-engagement-assistant-root', { timeout: 30000 });
    // Wait for the Preact app container inside the shadow root to be visible and ready
    await expect(page.locator('div#sidebar-app')).toBeVisible();
  });

  test('should update Live Counters on STATE_UPDATE event', async ({ page }) => {
    // 1. Define the mock state for the counters
    const mockState: Partial<UIState> = {
      stats: {
        totalTopLevelNoReplies: 42,
        userTopLevelNoReplies: 12,
      },
      isInitializing: false, // Ensure the skeleton loader is not shown
    };

    // 2. Dispatch the STATE_UPDATE message to the UI
    await dispatchMessage(page, { type: 'STATE_UPDATE', payload: mockState });

    // 3. Locate the counter value elements within the sidebar
    const totalCounter = page.locator('.counter-grid .counter-item:first-child .counter-value');
    const userCounter = page.locator('.counter-grid .counter-item:last-child .counter-value');

    // 4. Assert that the text content has been updated to match the mock data
    await expect(totalCounter).toHaveText('42');
    await expect(userCounter).toHaveText('12');
  });

  test('should update Pipeline Progress on STATE_UPDATE event', async ({ page }) => {
    // 1. Define a mock comment with specific statuses to test the stepper logic
    const mockComment: Comment = {
      commentId: 'mock-comment-id-123',
      text: 'This is a mock comment for testing pipeline progress.',
      ownerProfileUrl: 'https://www.linkedin.com/in/mockuser/',
      timestamp: new Date().toISOString(),
      type: 'top-level',
      connected: false,
      threadId: '',
      likeStatus: 'DONE', // This should make the 'Liked' step 'complete'
      replyStatus: '',     // With 'Liked' complete, this should make 'Replied' step 'active'
      dmStatus: '',
      attempts: { like: 1, reply: 0, dm: 0 },
      lastError: '',
      pipeline: { queuedAt: new Date().toISOString(), likedAt: new Date().toISOString(), repliedAt: '', dmAt: '' },
    };

    const mockState: Partial<UIState> = {
      comments: [mockComment],
      isInitializing: false,
      pipelineStatus: 'running',
    };

    // 2. Dispatch the STATE_UPDATE message
    await dispatchMessage(page, { type: 'STATE_UPDATE', payload: mockState });

    // 3. Locate the specific comment row using its data-testid
    const commentRow = page.locator(`[data-testid="pipeline-row-${mockComment.commentId}"]`);
    await expect(commentRow).toBeVisible();

    // 4. Locate the status indicators (the divs, not the labels) within the row
    const statusIndicators = commentRow.locator('.step-indicator[data-testid="status-indicator"]');

    // 5. Assert the status of each step by checking for the correct CSS class
    await expect(statusIndicators.nth(0)).toHaveClass(/step-complete/, { timeout: 5000 }); // Queued
    await expect(statusIndicators.nth(1)).toHaveClass(/step-complete/); // Liked
    await expect(statusIndicators.nth(2)).toHaveClass(/step-active/);   // Replied
    await expect(statusIndicators.nth(3)).toHaveClass(/step-pending/);  // DM Sent
  });

  test('should add new entry to Logs Panel on LOG_ENTRY event', async ({ page }) => {
    // 1. Define a mock log entry
    const mockLog: LogEntry = {
      timestamp: 1678886400000, // A fixed timestamp: 2023-03-15T12:00:00.000Z
      level: 'INFO',
      message: 'This is a simulated log message from the test.',
    };

    // 2. Dispatch the LOG_ENTRY message
    await dispatchMessage(page, { type: 'LOG_ENTRY', payload: mockLog });

    // 3. Locate the new log entry in the DOM using its unique data-testid
    const logEntry = page.locator(`[data-testid="log-entry-${mockLog.timestamp}"]`);

    // 4. Assert that the log entry is visible
    await expect(logEntry).toBeVisible();

    // 5. Assert that the content of the log entry is correct
    await expect(logEntry.locator('.log-level')).toHaveText('INFO');
    await expect(logEntry.locator('.log-message')).toHaveText(mockLog.message);
  });
});