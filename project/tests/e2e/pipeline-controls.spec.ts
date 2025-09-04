import { test, expect } from './fixtures';
import type { PostState, Comment } from '../../src/shared/types';

// Test data constants
const TEST_POST_URL =
  'https://www.linkedin.com/feed/update/urn:li:activity:7368619407989760000/';
const TEST_POST_URN = 'urn:li:activity:7368619407989760000';

// A mock comment to ensure the pipeline has something to process.
// This allows the test to control the pipeline's state without relying on live DOM,
// and ensures the pipeline will pause at the AI call step due to the fetch mock.
const mockComment: Comment = {
  commentId: 'urn:li:comment:(activity:7368619407989760000,87654321)',
  text: 'This is a test comment for the pipeline.',
  ownerProfileUrl: 'https://www.linkedin.com/in/test-user/',
  timestamp: '1d',
  type: 'top-level',
  connected: false, // Set to a known state to avoid connection check step
  threadId: 'urn:li:comment:(activity:7368619407989760000,87654321)',
  likeStatus: '', // This will be the first action
  replyStatus: '',
  dmStatus: '',
  attempts: { like: 0, reply: 0, dm: 0 },
  lastError: '',
  pipeline: {
    queuedAt: new Date().toISOString(),
    likedAt: '',
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

test.describe('Pipeline Control E2E Tests', () => {
  test.beforeEach(async ({ page, background }) => {
    // Inject mock state into the service worker's storage before navigating.
    // This is crucial for creating a predictable test environment.
    await background.evaluate(
      async ({ postUrn, state }: { postUrn: string; state: PostState }) => {
        // This function runs in the service worker's context.
        // We directly manipulate chrome.storage.local. The stateManager uses
        // the post URN itself as the key.
        // Using self.chrome to be explicit about accessing the global scope
        // in the service worker, which can help avoid potential scope resolution
        // issues within Playwright's evaluate context.
        await self.chrome.storage.local.set({ [postUrn]: state });
      },
      { postUrn: TEST_POST_URN, state: mockPostState }
    );

    // Navigate to a LinkedIn post page
    await page.goto(TEST_POST_URL, { waitUntil: 'domcontentloaded' });

    // Inject a mock DOM for the content script to interact with. This is done
    // by appending to the body rather than replacing its content, which avoids
    // breaking the host page's own scripts. This allows the pipeline's 'like'
    // action to succeed on a predictable element.
    await page.evaluate((commentId) => {
      const mockContainer = document.createElement('div');
      mockContainer.id = 'e2e-mock-container';
      mockContainer.style.display = 'none'; // Hide from view to not interfere with layout
      mockContainer.innerHTML = `
        <div id="comments-container">
          <article class="comments-comment-entity" data-id="${commentId}">
            <div class="comments-comment-item">
              <button class="reactions-react-button" aria-label="React Like"></button>
              <button class="comments-comment-social-bar__reply-action-button"></button>
            </div>
          </article>
        </div>
      `;
      document.body.appendChild(mockContainer);
    }, mockComment.commentId);

    // Wait for the sidebar to be attached to the DOM.
    // This is more reliable than a fixed timeout.
    const sidebarRootLocator = page.locator(
      '#linkedin-engagement-assistant-root'
    );
    await expect(sidebarRootLocator).toBeAttached({ timeout: 15000 });
  });

  test('should successfully control pipeline lifecycle: start, stop, and resume', async ({
    page,
  }) => {
    // Define locators for the control buttons within the sidebar's shadow DOM.
    // Playwright's locator piercing handles the shadow DOM automatically.
    const sidebarRootLocator = page.locator(
      '#linkedin-engagement-assistant-root'
    );
    const startButtonLocator = sidebarRootLocator.locator(
      '[data-testid="start-button"]'
    );
    const stopButtonLocator = sidebarRootLocator.locator(
      '[data-testid="stop-button"]'
    );
    const resumeButtonLocator = sidebarRootLocator.locator(
      '[data-testid="resume-button"]'
    );

    await test.step('Verify initial state is "idle"', async () => {
      // In the idle state, only the Start button should be visible.
      await expect(startButtonLocator).toBeVisible();
      await expect(stopButtonLocator).toBeHidden();
      await expect(resumeButtonLocator).toBeHidden();
    });

    await test.step('Start the pipeline and verify state is "running"', async () => {
      // Click the start button to begin the pipeline.
      await startButtonLocator.click();

      // After starting, the Stop button should become visible, and Start should be hidden.
      // Web-first assertions automatically wait for the UI to update.
      await expect(stopButtonLocator).toBeVisible({ timeout: 5000 });
      await expect(startButtonLocator).toBeHidden();
    });

    await test.step('Stop the pipeline and verify state is "paused"', async () => {
      // The mock fetch in fixtures.ts holds the pipeline in a running state,
      // allowing us to test stopping it. A small delay ensures the pipeline
      // has entered its processing loop before we interrupt it.
      await page.waitForTimeout(1000);
      await stopButtonLocator.click();

      // After stopping, the Resume button should be visible, and Stop should be hidden.
      await expect(resumeButtonLocator).toBeVisible({ timeout: 5000 });
      await expect(stopButtonLocator).toBeHidden();
    });

    await test.step('Resume the pipeline and verify state is "running"', async () => {
      // Click the resume button to continue the pipeline.
      await resumeButtonLocator.click();

      // After resuming, the Stop button should be visible again.
      await expect(stopButtonLocator).toBeVisible({ timeout: 5000 });
      await expect(resumeButtonLocator).toBeHidden();
    });

    await test.step('Perform final cleanup by stopping the pipeline', async () => {
      // Stop the pipeline to leave it in a clean state for any subsequent tests.
      await stopButtonLocator.click();

      // Verify it's paused again.
      await expect(resumeButtonLocator).toBeVisible({ timeout: 5000 });
    });
  });
});