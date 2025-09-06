import { test, expect } from './fixtures';
import type { PostState, Comment } from '../../src/shared/types';
import { getLinkedInUrl } from './helpers';

// Test data constants
const TEST_POST_URN = 'urn:li:activity:7369271078898126852'; // Use a different URN to avoid state conflicts
const TEST_POST_URL = getLinkedInUrl('post', TEST_POST_URN);

// A mock comment designed to trigger the AI reply step immediately.
// 'likeStatus' is 'DONE', so the pipeline moves to the 'reply' step.
const mockComment: Comment = {
  commentId: 'urn:li:comment:(activity:7369271078898126852,12345678)',
  text: 'This is a test comment for error handling.',
  ownerProfileUrl: 'https://www.linkedin.com/in/error-test-user/',
  timestamp: '2d',
  type: 'top-level',
  connected: false,
  threadId: 'urn:li:comment:(activity:7369271078898126852,12345678)',
  likeStatus: 'DONE', // Pre-condition: comment is already liked
  replyStatus: '', // Next step: reply to the comment
  dmStatus: '',
  attempts: { like: 0, reply: 0, dm: 0 },
  lastError: '',
  pipeline: {
    queuedAt: new Date().toISOString(),
    likedAt: new Date().toISOString(),
    repliedAt: '',
    dmAt: '',
  },
};

const mockPostState: PostState = {
  _meta: {
    postId: TEST_POST_URN,
    postUrl: TEST_POST_URL,
    lastUpdated: new Date().toISOString(),
    runState: 'idle',
    userProfileUrl: 'https://www.linkedin.com/in/signed-in-user/',
  },
  comments: [mockComment],
};

test.describe('Error Handling E2E Tests', () => {
  test('should display failed status and error log on API failure', async ({
    page,
    background,
  }) => {
    // 1. Inject mock state into the service worker's storage.
    // The network request to OpenRouter is mocked in the test fixture to ensure reliability.
    await background.evaluate(
      async ({ postUrn, state }: { postUrn: string; state: PostState }) => {
        await (
          self as unknown as {
            __E2E_TEST_SAVE_POST_STATE: (
              postUrn: string,
              state: PostState
            ) => Promise<void>;
          }
        ).__E2E_TEST_SAVE_POST_STATE(postUrn, state);
      },
      { postUrn: TEST_POST_URN, state: mockPostState }
    );

    // 2. Navigate to the post and wait for the UI to be ready.
    await page.goto(TEST_POST_URL, { waitUntil: 'domcontentloaded' });
    const sidebarRootLocator = page.locator(
      '#linkedin-engagement-assistant-root'
    );
    await expect(sidebarRootLocator).toBeAttached({ timeout: 15000 });

    // 3. Start the pipeline.
    const startButtonLocator = sidebarRootLocator.locator(
      '[data-testid="start-button"]'
    );
    await startButtonLocator.click();

    // 4. Verify the UI reflects the failure state.

    // 4.1. Check the Pipeline Progress for a 'FAILED' status on the 'Replied' step.
    const commentRowLocator = sidebarRootLocator.locator(
      `[data-testid='pipeline-row-${mockComment.commentId}']`
    );
    const repliedStepIndicator = commentRowLocator.locator(
      `[data-testid='step-indicator-Replied']`
    );

    // The assertion waits for the class to be applied, indicating the UI has updated.
    await expect(repliedStepIndicator).toHaveClass(/step-failed/, {
      timeout: 10000,
    });

    // 4.2. Check the Logs Panel for a corresponding error message.
    const errorLogLocator = sidebarRootLocator.locator('.log-entry--error');

    // Wait for the first error log to appear.
    await expect(errorLogLocator.first()).toBeVisible({ timeout: 10000 });

    const allErrorLogs = await errorLogLocator.allTextContents();
    const combinedErrorLogs = allErrorLogs.join(' ');

    // Check for the high-level error logged by the pipelineManager.
    expect(combinedErrorLogs).toContain('Failed to reply to comment');

    // Check for the specific error message from the mocked API response,
    // which should be propagated through the system and logged.
    expect(combinedErrorLogs).toContain('Simulated server error from test');
  });
});