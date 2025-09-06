import { test, expect } from './fixtures';
import type { PostState, Comment } from '../../src/shared/types';
import { getLinkedInUrl } from './helpers';

// Test data constants
const TEST_POST_URN = 'urn:li:activity:7369271078898126851';
const TEST_POST_URL = getLinkedInUrl('post', TEST_POST_URN);

// A mock comment designed to fail at the 'Reply' step.
// The 'Like' step is already marked as 'DONE' to isolate the reply action.
const mockComment: Comment = {
  commentId: 'urn:li:comment:(activity:7369271078898126851,12345678)',
  text: 'This is a test comment designed to trigger an API error.',
  ownerProfileUrl: 'https://www.linkedin.com/in/error-user/',
  timestamp: '2d',
  type: 'top-level',
  connected: false,
  threadId: 'urn:li:comment:(activity:7369271078898126851,12345678)',
  likeStatus: 'DONE', // Pre-condition: Liking is complete.
  replyStatus: '', // Pre-condition: Replying is the next step.
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
  test.beforeEach(async ({ page, background }) => {
    // Note: The fetch mock that forces a 500 error on the OpenRouter API
    // is automatically applied by `tests/e2e/fixtures.ts` because this
    // test file's name includes 'error-handling.spec'.

    // Inject mock state into the service worker's storage.
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

    // Navigate to the test post page.
    await page.goto(TEST_POST_URL, { waitUntil: 'domcontentloaded' });

    // Wait for the sidebar to be attached to the DOM.
    const sidebarRootLocator = page.locator(
      '#linkedin-engagement-assistant-root'
    );
    await expect(sidebarRootLocator).toBeAttached({ timeout: 15000 });
  });

  test('should display error state when API call fails', async ({ page }) => {
    const sidebarRootLocator = page.locator(
      '#linkedin-engagement-assistant-root'
    );
    const startButtonLocator = sidebarRootLocator.locator(
      '[data-testid="start-button"]'
    );

    // Define locators specific to the comment and its expected failure state.
    const commentRowLocator = sidebarRootLocator.locator(
      `[data-testid="pipeline-row-${mockComment.commentId}"]`
    );
    const failedStepIndicator = commentRowLocator.locator(
      '[data-testid="step-indicator-Replied"]'
    );
    const errorLogLocator = sidebarRootLocator.locator(
      '.log-entry--error:has-text("Failed to reply to comment")'
    );

    await test.step('Start the pipeline', async () => {
      await expect(startButtonLocator).toBeVisible();
      await startButtonLocator.click();
    });

    await test.step('Verify UI reflects the API failure', async () => {
      // The pipeline will attempt to reply, hit the mocked 500 error,
      // and update the state. Playwright's web-first assertions will
      // wait for the UI to reflect this change.

      // 1. Check that the 'Replied' step in the pipeline progress shows a 'failed' status.
      await expect(failedStepIndicator).toHaveClass(/step-failed/, {
        timeout: 10000,
      });

      // 2. Check that a corresponding error message appears in the logs panel.
      await expect(errorLogLocator).toBeVisible({ timeout: 10000 });
    });
  });
});