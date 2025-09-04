import { test, expect } from './fixtures';
import type { PostState } from '../../src/shared/types';

const MOCK_POST_URN = 'urn:li:activity:7123456789012345678';
const MOCK_POST_ID = '7123456789012345678';

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
      likeStatus: '', // This empty status means it needs processing
      replyStatus: '',
      dmStatus: '',
      connected: false,
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
              typeof (globalThis as any).__E2E_TEST_SAVE_POST_STATE === 'function'
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
          originalSendMessage?: typeof chrome.tabs.sendMessage;
        }
        const globalWithMocks = globalThis as GlobalThisWithMocks;

        // 1. Use the test hook to inject the mock state directly.
        // This populates both the in-memory state and chrome.storage.local,
        // ensuring the pipelineManager finds the state when started.
        if (globalWithMocks.__E2E_TEST_SAVE_POST_STATE) {
          await globalWithMocks.__E2E_TEST_SAVE_POST_STATE(postUrn, state);
          console.log('[MOCK] Injected mock post state for', postUrn);
        } else {
          console.error(
            '[MOCK] Test hook __E2E_TEST_SAVE_POST_STATE not found.'
          );
          // Fail fast if the hook isn't there
          throw new Error('__E2E_TEST_SAVE_POST_STATE is not available.');
        }

        // 2. Mock `chrome.tabs.sendMessage` to prevent real DOM actions.
        // We make it return a promise that never resolves for the 'LIKE_COMMENT' action.
        // This effectively pauses the pipeline, keeping it in a "running" state indefinitely
        // so we can test the Stop/Resume controls.
        if (!globalWithMocks.originalSendMessage) {
          globalWithMocks.originalSendMessage = chrome.tabs.sendMessage;
        }
        chrome.tabs.sendMessage = (
          _tabId: number,
          message: { type: string }
        ): Promise<unknown> => {
          console.log('[MOCK] Intercepted chrome.tabs.sendMessage', message);
          if (message.type === 'LIKE_COMMENT') {
            return new Promise(() => {
              /* Never resolves, pipeline "hangs" here */
            });
          }
          return Promise.resolve(true); // Other messages succeed immediately
        };
      },
      { state: mockPostState, postUrn: MOCK_POST_URN }
    );
  });

  // After each test, clean up the mocks and storage to ensure test isolation.
  test.afterEach(async ({ background }) => {
    await background.evaluate(() => {
      interface GlobalThisWithMocks {
        originalSendMessage?: typeof chrome.tabs.sendMessage;
      }
      const globalWithMocks = globalThis as GlobalThisWithMocks;

      // Restore original sendMessage
      if (globalWithMocks.originalSendMessage) {
        chrome.tabs.sendMessage = globalWithMocks.originalSendMessage;
        delete globalWithMocks.originalSendMessage;
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