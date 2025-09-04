import { test, expect } from './fixtures';
import type { PostState } from '../../src/shared/types';

const MOCK_POST_URN = 'urn:li:activity:7368619407989760000';
const MOCK_POST_ID = '7368619407989760000';

// A mock state with one comment that needs processing. This will be injected
// into the service worker's storage to set up the test precondition.
const mockPostState: PostState = {
  _meta: {
    postId: MOCK_POST_ID,
    postUrl: `https://www.linkedin.com/feed/update/${MOCK_POST_URN}/`,
    runState: 'idle',
    lastUpdated: new Date().toISOString(),
  },
  comments: [
    {
      commentId: 'comment-1',
      text: 'A comment to be processed.',
      ownerProfileUrl: 'https://www.linkedin.com/in/someuser/',
      timestamp: '1d',
      type: 'top-level',
      threadId: 'comment-1',
      likeStatus: '',
      replyStatus: '',
      dmStatus: '',
      // `connected` is omitted, making it `undefined`. This will trigger the
      // connection check step in the pipeline first.
      attempts: { like: 0, reply: 0, dm: 0 },
      lastError: '',
      pipeline: {
        queuedAt: new Date().toISOString(),
        likedAt: '',
        repliedAt: '',
        dmAt: '',
      },
    },
  ],
};

test.describe('Pipeline Controls (Start, Stop, Resume)', () => {
  // Before each test, set up mocks and state inside the service worker
  test.beforeEach(async ({ background }) => {
    // Wait for the E2E test hook to be available on the service worker,
    // which indicates that the background script is fully loaded and ready.
    await expect
      .poll(
        () =>
          background.evaluate(
            () =>
              typeof (
                globalThis as { __E2E_TEST_SAVE_POST_STATE?: unknown }
              ).__E2E_TEST_SAVE_POST_STATE === 'function'
          ),
        {
          message: 'E2E test hook not available on service worker',
          timeout: 10000,
        }
      )
      .toBe(true);

    await background.evaluate(
      async ({ state, postUrn }) => {
        // Define types for our custom properties on globalThis
        interface GlobalThisWithMocks {
          __E2E_TEST_SAVE_POST_STATE?: (
            urn: string,
            state: unknown
          ) => Promise<void>;
          originalTabsCreate?: typeof chrome.tabs.create;
        }
        const globalWithMocks = globalThis as GlobalThisWithMocks;

        // 1. Use the test hook to inject the mock state directly.
        if (globalWithMocks.__E2E_TEST_SAVE_POST_STATE) {
          await globalWithMocks.__E2E_TEST_SAVE_POST_STATE(postUrn, state);
          console.log('[MOCK] Injected mock post state for', postUrn);
        } else {
          console.error(
            '[MOCK] Test hook __E2E_TEST_SAVE_POST_STATE not found.'
          );
          throw new Error('__E2E_TEST_SAVE_POST_STATE is not available.');
        }

        // 2. Mock `chrome.tabs.create`. The pipeline uses this to check a user's
        // connection status. By making it return a promise that never resolves,
        // we effectively pause the pipeline, keeping it in a "running" state
        // indefinitely so we can test the Stop/Resume controls.
        if (!globalWithMocks.originalTabsCreate) {
          globalWithMocks.originalTabsCreate = chrome.tabs.create;
        }
        chrome.tabs.create = (
          _createProperties: chrome.tabs.CreateProperties
        ): Promise<chrome.tabs.Tab> => {
          console.log('[MOCK] Intercepted chrome.tabs.create');
          return new Promise(() => {
            /* Never resolves, pipeline "hangs" here */
          });
        };
      },
      { state: mockPostState, postUrn: MOCK_POST_URN }
    );
  });

  // After each test, clean up the mocks and storage to ensure test isolation.
  test.afterEach(async ({ background }) => {
    await background.evaluate(() => {
      interface GlobalThisWithMocks {
        originalTabsCreate?: typeof chrome.tabs.create;
      }
      const globalWithMocks = globalThis as GlobalThisWithMocks;

      // Restore original chrome.tabs.create
      if (globalWithMocks.originalTabsCreate) {
        chrome.tabs.create = globalWithMocks.originalTabsCreate;
        delete globalWithMocks.originalTabsCreate;
      }
      // Clear storage to prevent state from leaking between tests
      void chrome.storage.local.clear();
    });
  });

  test('should correctly cycle through start, stop, and resume states', async ({
    page,
  }) => {
    // 1. Navigate to the mock post URL.
    await page.goto(
      `https://www.linkedin.com/feed/update/${MOCK_POST_URN}/`
    );
    const sidebarHost = page.locator('div.sidebar');
    await expect(sidebarHost).toBeVisible({ timeout: 10000 });

    // --- START FLOW ---
    // 2. Find and click the 'Start' button.
    const startButton = sidebarHost.locator('button', { hasText: 'Start' });
    await expect(startButton).toBeVisible();
    await startButton.click();

    // 3. Verify the UI updates to the 'running' state. This happens because the
    //    pipelineManager in the background now starts, broadcasts its new state,
    //    and the UI reacts.
    const stopButton = sidebarHost.locator('button', { hasText: 'Stop' });
    await expect(stopButton).toBeVisible({ timeout: 5000 });
    await expect(startButton).not.toBeVisible();

    // --- STOP FLOW ---
    // 4. Click the 'Stop' button.
    await stopButton.click();

    // 5. Verify the UI updates to the 'paused' state.
    const resumeButton = sidebarHost.locator('button', { hasText: 'Resume' });
    await expect(resumeButton).toBeVisible({ timeout: 5000 });
    await expect(stopButton).not.toBeVisible();

    // --- RESUME FLOW ---
    // 6. Click the 'Resume' button.
    await resumeButton.click();

    // 7. Verify the UI returns to the 'running' state.
    await expect(stopButton).toBeVisible({ timeout: 5000 });
    await expect(resumeButton).not.toBeVisible();
  });
});