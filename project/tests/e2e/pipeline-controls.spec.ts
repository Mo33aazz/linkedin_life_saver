import { test, expect } from './fixtures';
import type { PostState, AIConfig } from '../../src/shared/types';

// Add this declaration to make TS and ESLint happy about the custom E2E hooks
// that are injected into the service worker context by `setup.spec.ts`.
// We augment `Window` because in the test file's compilation context (with both
// 'dom' and 'webworker' libs), TypeScript resolves `self` to `Window & typeof globalThis`.
// This satisfies the type checker for the `background.evaluate` calls, even though
// the code actually runs in a `ServiceWorkerGlobalScope` at runtime.
declare global {
  interface Window {
    __E2E_TEST_HOOKS_INSTALLED?: boolean;
    __E2E_TEST_SAVE_POST_STATE: (postUrn: string, state: PostState) => void;
    __E2E_TEST_UPDATE_CONFIG: (config: Partial<AIConfig>) => void;
  }
}

const MOCK_POST_URN = 'urn:li:activity:7123456789012345678';

test.describe('Pipeline Controls', () => {
  // Inject mock state before each test in this suite
  test.beforeEach(async ({ background }) => {
    // Wait until the service worker has installed the E2E test hooks.
    // This prevents a race condition where the test tries to call a hook
    // before the service worker has finished its initial execution.
    await expect
      .poll(
        () =>
          background.evaluate(() => self.__E2E_TEST_HOOKS_INSTALLED),
        {
          message: 'E2E test hooks should be installed in the service worker',
          timeout: 10000,
        }
      )
      .toBe(true);

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
          connected: false, // Set to false to avoid opening new tabs during test
          threadId: 'thread-1',
          likeStatus: 'DONE', // Mark as already liked to force the reply step
          replyStatus: '', // Mark as needing processing
          dmStatus: '',
          attempts: { like: 0, reply: 0, dm: 0 },
          lastError: '',
          pipeline: {
            queuedAt: '',
            likedAt: new Date().toISOString(), // Already liked
            repliedAt: '',
            dmAt: '',
            generatedReply: '',
          },
        },
        {
          commentId: 'comment-2',
          text: 'Another test comment for processing.',
          ownerProfileUrl: 'https://www.linkedin.com/in/another-user/',
          timestamp: new Date().toISOString(),
          type: 'top-level',
          connected: false,
          threadId: 'thread-2',
          likeStatus: '', // Needs processing from the beginning
          replyStatus: '',
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
        self.__E2E_TEST_SAVE_POST_STATE(postUrn, state);
      },
      { postUrn: MOCK_POST_URN, state: mockPostState }
    );

    // Set a mock API key to prevent the pipeline from failing immediately
    await background.evaluate(
      (config) => {
        // This function runs in the service worker's context
        self.__E2E_TEST_UPDATE_CONFIG(config);
      },
      { 
        apiKey: 'MOCK_API_KEY_FOR_TESTING',
        model: 'anthropic/claude-3.5-sonnet',
        temperature: 0.5,
        top_p: 1.0,
        max_tokens: 220,
      } as Partial<AIConfig>
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
              <body>
                <h1>Mock LinkedIn Post Page</h1>
                <div id="linkedin-content">
                  <!-- Mock content that the content script can detect -->
                </div>
              </body>
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
    console.log('Verifying initial state...');
    await expect(sidebarHost).toBeVisible({ timeout: 10000 });
    await expect(startButton).toBeVisible({ timeout: 5000 });
    await expect(stopButton).not.toBeVisible();
    await expect(resumeButton).not.toBeVisible();

    // 6. Test the 'Start' action.
    // Clicking 'Start' should change the state to 'running'.
    console.log('Testing: Clicking Start button');
    await startButton.click();

    // Assert that the UI reflects the 'running' state.
    await expect(stopButton).toBeVisible({ timeout: 5000 });
    await expect(startButton).not.toBeVisible();
    await expect(resumeButton).not.toBeVisible();
    console.log('✓ Pipeline started successfully');

    // 7. Test the 'Stop' action.
    // Clicking 'Stop' should change the state to 'paused'.
    console.log('Testing: Clicking Stop button');
    await stopButton.click();

    // Assert that the UI reflects the 'paused' state.
    await expect(resumeButton).toBeVisible({ timeout: 5000 });
    await expect(stopButton).not.toBeVisible();
    await expect(startButton).not.toBeVisible();
    console.log('✓ Pipeline stopped successfully');

    // 8. Test the 'Resume' action.
    // Clicking 'Resume' should change the state back to 'running'.
    console.log('Testing: Clicking Resume button');
    await resumeButton.click();

    // Assert that the UI reflects the 'running' state again.
    await expect(stopButton).toBeVisible({ timeout: 5000 });
    await expect(resumeButton).not.toBeVisible();
    await expect(startButton).not.toBeVisible();
    console.log('✓ Pipeline resumed successfully');

    // 9. Optional: Test stopping again to ensure the cycle works correctly
    console.log('Testing: Clicking Stop button again');
    await stopButton.click();
    
    await expect(resumeButton).toBeVisible({ timeout: 5000 });
    await expect(stopButton).not.toBeVisible();
    console.log('✓ Pipeline stopped again successfully');
  });

  test('should display correct pipeline status and counters', async ({
    page,
    background,
  }) => {
    // Set up route for the mock LinkedIn post
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
              <body>
                <h1>Mock LinkedIn Post Page</h1>
              </body>
            </html>
          `,
        });
      }
    );

    // Navigate to the mock post
    await page.goto(
      `https://www.linkedin.com/feed/update/${MOCK_POST_URN}/`
    );

    // Wait for sidebar to be visible
    const sidebarHost = page.locator('div.sidebar');
    await expect(sidebarHost).toBeVisible({ timeout: 10000 });

    // Check that the counters section is visible
    const countersSection = sidebarHost.locator('.sidebar-section').filter({ hasText: 'Live Counters' });
    await expect(countersSection).toBeVisible();

    // Verify initial counter values
    const totalTopLevel = countersSection.locator('[data-testid="total-top-level"]');
    const userTopLevel = countersSection.locator('[data-testid="user-top-level"]');
    
    // The mock state has 2 top-level comments, both external (not from user)
    await expect(totalTopLevel).toContainText('2', { timeout: 5000 });
    await expect(userTopLevel).toContainText('0', { timeout: 5000 });

    // Check pipeline progress section
    const progressSection = sidebarHost.locator('.sidebar-section').filter({ hasText: 'Pipeline Progress' });
    await expect(progressSection).toBeVisible();

    // Start the pipeline
    const startButton = sidebarHost.locator('[data-testid="start-button"]');
    await startButton.click();

    // Verify that pipeline progress shows comments being processed
    const commentRows = progressSection.locator('[data-testid^="comment-row-"]');
    await expect(commentRows).toHaveCount(2, { timeout: 5000 });

    // Check that the first comment shows as already liked (based on mock data)
    const firstCommentRow = commentRows.first();
    await expect(firstCommentRow).toContainText('test comment that needs processing');
    
    // Stop the pipeline to complete the test
    const stopButton = sidebarHost.locator('[data-testid="stop-button"]');
    await stopButton.click();
  });

  test('should handle errors gracefully', async ({
    page,
    background,
  }) => {
    // Inject a state with a comment that will fail
    const errorPostState: PostState = {
      _meta: {
        postId: MOCK_POST_URN,
        postUrl: `https://www.linkedin.com/feed/update/${MOCK_POST_URN}/`,
        lastUpdated: new Date().toISOString(),
        runState: 'idle',
      },
      comments: [
        {
          commentId: 'error-comment',
          text: '__FORCE_ERROR__', // Special text to trigger an error in tests
          ownerProfileUrl: 'https://www.linkedin.com/in/error-user/',
          timestamp: new Date().toISOString(),
          type: 'top-level',
          connected: false,
          threadId: 'error-thread',
          likeStatus: '',
          replyStatus: '',
          dmStatus: '',
          attempts: { like: 3, reply: 3, dm: 0 }, // Max attempts reached
          lastError: 'Simulated error for testing',
          pipeline: {
            queuedAt: new Date().toISOString(),
            likedAt: '',
            repliedAt: '',
            dmAt: '',
          },
        },
      ],
    };

    await background.evaluate(
      ({ postUrn, state }) => {
        self.__E2E_TEST_SAVE_POST_STATE(postUrn, state);
      },
      { postUrn: MOCK_POST_URN, state: errorPostState }
    );

    // Set up route and navigate
    await page.route(
      `**/feed/update/${MOCK_POST_URN}/**`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `<!DOCTYPE html><html><body>Mock Post</body></html>`,
        });
      }
    );

    await page.goto(
      `https://www.linkedin.com/feed/update/${MOCK_POST_URN}/`
    );

    // Wait for sidebar
    const sidebarHost = page.locator('div.sidebar');
    await expect(sidebarHost).toBeVisible({ timeout: 10000 });

    // Check that the logs panel shows error messages
    const logsPanel = sidebarHost.locator('.sidebar-section').filter({ hasText: 'Logs' });
    await expect(logsPanel).toBeVisible();

    // Start the pipeline - it should handle the error gracefully
    const startButton = sidebarHost.locator('[data-testid="start-button"]');
    await startButton.click();

    // The pipeline should still be controllable despite errors
    const stopButton = sidebarHost.locator('[data-testid="stop-button"]');
    await expect(stopButton).toBeVisible({ timeout: 5000 });

    // Stop the pipeline
    await stopButton.click();
    
    // Verify we can still resume after an error
    const resumeButton = sidebarHost.locator('[data-testid="resume-button"]');
    await expect(resumeButton).toBeVisible({ timeout: 5000 });
  });
});