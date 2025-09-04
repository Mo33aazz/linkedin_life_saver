import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import type { UIState, Comment, ExtensionMessage } from '../../src/shared/types';

// Helper function to dispatch messages to the UI's store via postMessage
const dispatchMessage = async (page: Page, message: ExtensionMessage) => {
  await page.evaluate((msg: ExtensionMessage) => {
    // Post message to the window. The content script, running in an isolated world,
    // will be listening for these messages to update its state.
    // We add a source to identify that it's from our E2E test.
    window.postMessage({ ...msg, source: '__E2E_TEST__' }, '*');
  }, message);
};

test.describe('Error Handling', () => {
  const postUrl = 'https://www.linkedin.com/feed/update/urn:li:activity:7368619407989760000/';

  test.beforeEach(async ({ page }) => {
    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    // Wait for the sidebar root element to be injected into the DOM
    await page.waitForSelector('#linkedin-engagement-assistant-root', { timeout: 30000 });
    // Wait for the Preact app container inside the shadow root to be visible and ready.
    // This ensures the UI and its message listeners are active.
    await expect(page.locator('#sidebar-app')).toBeVisible();
  });

  test('should display FAILED status and error log when AI call fails', async ({ page, context }) => {
    // 1. Intercept the network request to OpenRouter and force a failure
    await context.route('**/api/v1/chat/completions', async route => {
      console.log('Intercepted OpenRouter API call, returning 500 error.');
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Mocked server error from Playwright' } }),
      });
    });

    // 2. Prepare the initial UI state to be ready for the 'reply' step
    const mockComment: Comment = {
      commentId: 'error-test-comment-1',
      text: 'This comment will trigger a failed AI reply.',
      ownerProfileUrl: 'https://www.linkedin.com/in/failure-user/',
      timestamp: new Date().toISOString(),
      type: 'top-level',
      connected: false,
      threadId: '',
      likeStatus: 'DONE', // Prerequisite for the reply step
      replyStatus: '',     // This is the step that will be attempted and fail
      dmStatus: '',
      attempts: { like: 1, reply: 0, dm: 0 },
      lastError: '',
      pipeline: { queuedAt: new Date().toISOString(), likedAt: new Date().toISOString(), repliedAt: '', dmAt: '' },
    };

    const mockInitialState: Partial<UIState> = {
      comments: [mockComment],
      isInitializing: false,
      pipelineStatus: 'idle', // Start from an idle state
    };

    await dispatchMessage(page, { type: 'STATE_UPDATE', payload: mockInitialState });

    // 3. Trigger the pipeline by clicking the 'Start' button
    await page.locator('button:has-text("Start")').click();

    // 4. Verify the Pipeline Progress UI shows the failure
    const commentRow = page.locator(`[data-testid="pipeline-row-${mockComment.commentId}"]`);
    
    // The steps are: Queued (0), Liked (1), Replied (2), DM Sent (3)
    const repliedStepIndicator = commentRow.locator('[data-testid="status-indicator"]').nth(2);

    // Assert that the 'Replied' step indicator has the 'step-failed' class.
    // We use a longer timeout to account for network retries in the service worker.
    await expect(repliedStepIndicator).toHaveClass(/step-failed/, { timeout: 15000 });

    // 5. Verify the Logs Panel shows a corresponding error message
    const errorLog = page.locator('.log-entry--error').first();
    await expect(errorLog).toBeVisible();
    
    // This message comes from the catch block in `processComment` in `pipelineManager.ts`
    await expect(errorLog).toContainText('Failed to reply to comment');
  });
});