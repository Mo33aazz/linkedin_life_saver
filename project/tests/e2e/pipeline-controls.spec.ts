import { test, expect } from './fixtures';
import type { PostState } from '../../src/shared/types';

const MOCK_POST_URN = 'urn:li:activity:7123456789012345678';

test.describe('Pipeline Controls', () => {
  // Inject mock state before each test in this suite
  test.beforeEach(async ({ background }) => {
    const mockPostState: PostState = {
      _meta: {
        postId: MOCK_POST_URN,
        postUrl: `https://www.linkedin.com/feed/update/${MOCK_POST_URN}/`,
        lastUpdated: new Date().toISOString(),
        runState: 'idle',
      },
      comments: [
        {
          commentId: 'comment-1',
          text: 'This is a test comment that needs processing.',
          ownerProfileUrl: 'https://www.linkedin.com/in/test-user/',
          timestamp: new Date().toISOString(),
          type: 'top-level',
          threadId: 'thread-1',
          likeStatus: 'DONE', // Mark as already liked to force the reply step
          replyStatus: '', // Mark as needing processing
          dmStatus: '',
          attempts: { like: 0, reply: 0, dm: 0 },
          lastError: '',
          pipeline: {
            queuedAt: '',
            likedAt: '',
            repliedAt: '',
            dmAt: '',
          },
        },
      ],
    };

    // Use the E2E test hook to inject state directly into the service worker
    await background.evaluate(
      ({ postUrn, state }) => {
        // This function runs in the service worker's context
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (self as any).__E2E_TEST_SAVE_POST_STATE(postUrn, state);
      },
      { postUrn: MOCK_POST_URN, state: mockPostState }
    );

    // Set a mock API key to prevent the pipeline from failing immediately
    await background.evaluate(
      (config) => {
        // This function runs in the service worker's context
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (self as any).__E2E_TEST_UPDATE_CONFIG(config);
      },
      { apiKey: 'MOCK_API_KEY_FOR_TESTING' }
    );
  });

  test('should correctly start, stop, and resume the pipeline', async ({
    page,
  }) => {
    // 1. The test fixture (`tests/e2e/fixtures.ts`) is pre-configured to intercept
    // network requests from the service worker to the OpenRouter API. It holds
    // the request pending indefinitely. This causes the pipeline to remain in a
    // "running" state without actually hitting the network, allowing us to test
    // the UI's running/paused states.

    // 2. Intercept the navigation to the LinkedIn post and provide a mock response.
    // This avoids dealing with authentication and network flakiness.
    await page.route(
      `**/feed/update/${MOCK_POST_URN}/**`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `
            <!DOCTYPE html>
            <html>
              <head><title>Mock LinkedIn Post</title></head>
              <body><h1>A mock post page</h1></body>
            </html>
          `,
        });
      }
    );

    // 3. Navigate to the URL. The content script will match this URL pattern.
    await page.goto(
      `https://www.linkedin.com/feed/update/${MOCK_POST_URN}/`
    );

    // 4. Define locators for the sidebar and control buttons.
    // Playwright automatically pierces shadow DOM when chaining locators.
    const sidebarHost = page.locator('div.sidebar');
    const startButton = sidebarHost.locator('[data-testid="start-button"]');
    const stopButton = sidebarHost.locator('[data-testid="stop-button"]');
    const resumeButton = sidebarHost.locator('[data-testid="resume-button"]');

    // 5. Verify the initial state: The sidebar is visible and in 'idle' mode.
    await expect(sidebarHost).toBeVisible({ timeout: 10000 });
    await expect(startButton).toBeVisible();
    await expect(stopButton).not.toBeVisible();
    await expect(resumeButton).not.toBeVisible();

    // 6. Test the 'Start' action.
    // Clicking 'Start' should change the state to 'running'.
    console.log('Testing: Clicking Start');
    await startButton.click();

    // Assert that the UI reflects the 'running' state.
    await expect(stopButton).toBeVisible();
    await expect(startButton).not.toBeVisible();

    // 7. Test the 'Stop' action.
    // Clicking 'Stop' should change the state to 'paused'.
    console.log('Testing: Clicking Stop');
    await stopButton.click();

    // Assert that the UI reflects the 'paused' state.
    await expect(resumeButton).toBeVisible();
    await expect(stopButton).not.toBeVisible();

    // 8. Test the 'Resume' action.
    // Clicking 'Resume' should change the state back to 'running'.
    console.log('Testing: Clicking Resume');
    await resumeButton.click();

    // Assert that the UI reflects the 'running' state again.
    await expect(stopButton).toBeVisible();
    await expect(resumeButton).not.toBeVisible();
  });
});