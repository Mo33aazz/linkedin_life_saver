import { test, expect } from './fixtures';
import type { PostState, Comment } from '../../src/shared/types';

// Test data constants
const TEST_POST_URL =
  'https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/';
const TEST_POST_URN = 'urn:li:activity:7123456789012345678';

// A mock comment designed to fail at the "reply" step.
// 'likeStatus' is 'DONE' so the pipeline proceeds to the reply step.
// 'replyStatus' is '' so the pipeline will attempt to reply.
const mockComment: Comment = {
  commentId: 'urn:li:comment:(activity:7123456789012345678,123456789)',
  text: 'This is a test comment that will trigger an AI error.',
  ownerProfileUrl: 'https://www.linkedin.com/in/error-test-user/',
  timestamp: '2d',
  type: 'top-level',
  connected: false,
  threadId: 'urn:li:comment:(activity:7123456789012345678,123456789)',
  likeStatus: 'DONE', // Pre-condition: Liking is already complete.
  replyStatus: '', // Target: This is the step that will be attempted and fail.
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
    // 0. Set a dummy API key to bypass the config check and test network failure.
    await background.evaluate(async () => {
      // This is a test-only hook exposed by the service worker setup in fixtures.ts
      await (
        self as unknown as {
          __E2E_TEST_UPDATE_CONFIG: (config: { apiKey: string }) => Promise<void>;
        }
      ).__E2E_TEST_UPDATE_CONFIG({ apiKey: 'DUMMY_KEY_FOR_TESTING' });
    });

    // 1. Mock the network request to OpenRouter to simulate an API failure.
    // This is done by instrumenting the service worker's global fetch.
    await background.evaluate(() => {
      const selfWithMocks = self as unknown as {
        __E2E_MOCK_FETCH: (
          url: string,
          resp: { status: number; body: object }
        ) => void;
      };
      selfWithMocks.__E2E_MOCK_FETCH('/api/v1/chat/completions', {
        status: 500,
        body: { error: { message: 'Simulated server error' } },
      });
    });

    // 2. Inject the mock state into the service worker's storage.
    // This ensures the pipeline starts with a predictable state, specifically
    // with a comment that is ready to be replied to.
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

    // 3. Navigate to the target page and wait for the UI to be ready.
    await page.goto(TEST_POST_URL, { waitUntil: 'domcontentloaded' });

    const sidebarRootLocator = page.locator(
      '#linkedin-engagement-assistant-root'
    );
    await expect(sidebarRootLocator).toBeAttached({ timeout: 15000 });
  });

  test('should display FAILED status and error log when AI call fails', async ({
    page,
  }) => {
    // Define locators for key UI elements.
    const sidebarRootLocator = page.locator(
      '#linkedin-engagement-assistant-root'
    );
    const startButtonLocator = sidebarRootLocator.locator(
      '[data-testid="start-button"]'
    );
    const commentRowLocator = sidebarRootLocator.locator(
      `[data-testid="pipeline-row-${mockComment.commentId}"]`
    );
    // This selector targets the specific test ID for the "Replied" step's status indicator,
    // making it more robust against UI structure and style changes.
    const repliedStepIndicator = commentRowLocator.locator(
      '[data-testid="step-indicator-Replied"]'
    );
    // This locator is specific to the final error log, ignoring intermediate errors.
    const errorLogLocator = sidebarRootLocator.locator(
      '.log-entry--error:has-text("Failed to reply to comment")'
    );

    await test.step('Start the pipeline', async () => {
      await expect(startButtonLocator).toBeVisible();
      await startButtonLocator.click();
    });

    await test.step('Verify UI shows FAILED status for the reply step', async () => {
      // The assertion waits for the class 'step-failed' to be applied to the
      // indicator, confirming the UI has updated to reflect the error state.
      await expect(repliedStepIndicator).toHaveClass(/step-failed/, {
        timeout: 10000,
      });
    });

    await test.step('Verify a structured error log is displayed in the logs panel', async () => {
      // The assertion waits for the specific, final error log entry to become visible.
      await expect(errorLogLocator).toBeVisible();
      // It then checks that the log message contains the expected error text,
      // confirming that the specific failure was logged correctly.
      await expect(errorLogLocator).toContainText('Failed to reply to comment');
    });
  });
});