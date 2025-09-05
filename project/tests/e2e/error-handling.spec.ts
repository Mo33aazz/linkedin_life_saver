import { test, expect } from './fixtures';
import type { PostState, Comment, AIConfig } from '../../src/shared/types';

const TEST_POST_URL = 'https://www.linkedin.com/feed/update/urn:li:activity:7368619407989760000/';
const TEST_POST_URN = 'urn:li:activity:7368619407989760000';

// A mock comment ready for the 'reply' step, which we will force to fail.
const mockComment: Comment = {
  commentId: 'error-test-comment-1',
  text: 'This comment will trigger a failed AI reply.',
  ownerProfileUrl: 'https://www.linkedin.com/in/failure-user/',
  timestamp: new Date().toISOString(),
  type: 'top-level',
  connected: false,
  threadId: 'error-test-comment-1',
  likeStatus: 'DONE', // Prerequisite for the reply step
  replyStatus: '',     // This is the step that will be attempted and fail
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
    // 1. Set a mock API key. This is crucial for the pipeline to attempt the
    // network call that this test intends to intercept and fail. Without a key,
    // the pipeline would fail prematurely with an "API key not set" error.
    await background.evaluate(async () => {
      await (
        self as unknown as {
          __E2E_TEST_UPDATE_CONFIG: (config: Partial<AIConfig>) => Promise<void>;
        }
      ).__E2E_TEST_UPDATE_CONFIG({ apiKey: 'sk-test-key-for-error-handling' });
    });

    // 2. Inject mock state into the service worker's storage before navigating.
    // This ensures the background script has the correct data when the pipeline starts.
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

    // 3. Navigate to the test page
    await page.goto(TEST_POST_URL, { waitUntil: 'domcontentloaded' });

    // 4. Wait for the sidebar to be ready
    await page.waitForSelector('#linkedin-engagement-assistant-root', { timeout: 30000 });
    await expect(page.locator('#sidebar-app')).toBeVisible();
  });

  test('should display FAILED status and error log when AI call fails', async ({ page, background }) => {
    // 1. Intercept the network request to OpenRouter and force a failure using the
    // service worker's internal fetch mock.
    await background.evaluate(() => {
      const selfWithMocks = self as unknown as {
        __E2E_MOCK_FETCH: (
          url: string,
          resp: { status: number; body: object }
        ) => void;
      };
      selfWithMocks.__E2E_MOCK_FETCH('/api/v1/chat/completions', {
        status: 500,
        body: { error: { message: 'Mocked server error from Playwright' } },
      });
    });

    const sidebarRootLocator = page.locator('#linkedin-engagement-assistant-root');
    const commentRow = sidebarRootLocator.locator(`[data-testid="pipeline-row-${mockComment.commentId}"]`);
    const repliedStepIndicator = commentRow.locator('[data-testid="status-indicator"]').nth(2);

    // 2. The UI should have loaded the state from the background script automatically.
    // We verify the initial state is correct: 'Replied' step should be 'active'.
    await expect(repliedStepIndicator).toHaveClass(/step-active/);

    // 3. Trigger the pipeline by clicking the 'Start' button
    await sidebarRootLocator.locator('[data-testid="start-button"]').click();

    // 4. Verify the Pipeline Progress UI shows the failure.
    // Assert that the 'Replied' step indicator now has the 'step-failed' class.
    // We use a longer timeout to account for network retries in the service worker.
    await expect(repliedStepIndicator).toHaveClass(/step-failed/, { timeout: 15000 });

    // 5. Verify the Logs Panel shows corresponding error messages.
    const logsPanel = sidebarRootLocator.locator('.log-container');
    await expect(logsPanel.locator('.log-entry--error').first()).toBeVisible();
    
    // The pipeline logs multiple errors for this scenario. We check that the key messages appear somewhere in the log panel.
    // This message comes from the catch block in `generateReply` in `pipelineManager.ts`
    await expect(logsPanel).toContainText('Failed to generate AI reply', { timeout: 10000 });
    // This message comes from the mocked API response itself, bubbled up through the error chain
    await expect(logsPanel).toContainText('Mocked server error from Playwright');
    // This message comes from the catch block in `processComment` in `pipelineManager.ts`
    await expect(logsPanel).toContainText('Failed to reply to comment');
    // This message comes from the error thrown when `generateReply` returns null
    await expect(logsPanel).toContainText('AI reply generation failed after all retries');
  });
});