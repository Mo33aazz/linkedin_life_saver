import { test, expect } from './fixtures';
import { Page, Frame, Worker } from '@playwright/test';

// Helper to wait for the sidebar to be injected and ready
async function waitForSidebar(page: Page): Promise<Frame | null> {
  // Wait for the sidebar container to be injected
  await page.waitForSelector('[data-testid="linkedin-assistant-sidebar"]', {
    timeout: 15000,
    state: 'attached'
  });

  // The sidebar uses Shadow DOM, so we need to pierce through it
  const sidebarHost = await page.locator('[data-testid="linkedin-assistant-sidebar"]').elementHandle();
  if (!sidebarHost) return null;

  // Get the shadow root
  const shadowRoot = await sidebarHost.evaluateHandle((el) => el.shadowRoot);
  if (!shadowRoot) return null;

  return null; // For now, we'll interact directly with the page
}

// Helper to get the current pipeline status from the UI
async function getPipelineStatus(page: Page): Promise<string> {
  // Since we're using Shadow DOM, we need to evaluate inside the shadow root
  return await page.evaluate(() => {
    const sidebar = document.querySelector('[data-testid="linkedin-assistant-sidebar"]');
    if (!sidebar || !sidebar.shadowRoot) return 'unknown';
    
    // Try to find the status indicator in the shadow DOM
    const statusElement = sidebar.shadowRoot.querySelector('[data-testid="pipeline-status"]');
    return statusElement?.textContent?.toLowerCase() || 'unknown';
  });
}

// Helper to click a button inside the shadow DOM
async function clickShadowButton(page: Page, testId: string): Promise<void> {
  await page.evaluate((buttonTestId) => {
    const sidebar = document.querySelector('[data-testid="linkedin-assistant-sidebar"]');
    if (!sidebar || !sidebar.shadowRoot) throw new Error('Sidebar not found');
    
    const button = sidebar.shadowRoot.querySelector(`[data-testid="${buttonTestId}"]`) as HTMLButtonElement;
    if (!button) throw new Error(`Button with testId "${buttonTestId}" not found`);
    
    button.click();
  }, testId);
}

// Helper to verify button visibility in shadow DOM
async function isButtonVisible(page: Page, testId: string): Promise<boolean> {
  return await page.evaluate((buttonTestId) => {
    const sidebar = document.querySelector('[data-testid="linkedin-assistant-sidebar"]');
    if (!sidebar || !sidebar.shadowRoot) return false;
    
    const button = sidebar.shadowRoot.querySelector(`[data-testid="${buttonTestId}"]`) as HTMLButtonElement;
    return button !== null && !button.hidden && button.offsetParent !== null;
  }, testId);
}

// Helper to wait for state change with timeout
async function waitForStateChange(
  page: Page,
  targetState: 'idle' | 'running' | 'paused' | 'error',
  timeout: number = 10000
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const currentState = await getPipelineStatus(page);
    if (currentState === targetState) {
      return;
    }
    await page.waitForTimeout(100);
  }
  
  throw new Error(`Timeout waiting for state change to ${targetState}`);
}

// Helper to verify background service worker state
async function verifyBackgroundState(
  background: Worker,
  expectedState: 'idle' | 'running' | 'paused' | 'error'
): Promise<void> {
  const actualState = await background.evaluate(() => {
    // Access the pipeline manager's state if exposed
    // This assumes the service worker exposes a global method for testing
    if (typeof (self as any).getPipelineStatus === 'function') {
      return (self as any).getPipelineStatus();
    }
    return 'unknown';
  });
  
  expect(actualState).toBe(expectedState);
}

// Helper to get comment processing stats
async function getProcessingStats(page: Page): Promise<{
  processed: number;
  remaining: number;
  liked: number;
  replied: number;
}> {
  return await page.evaluate(() => {
    const sidebar = document.querySelector('[data-testid="linkedin-assistant-sidebar"]');
    if (!sidebar || !sidebar.shadowRoot) {
      return { processed: 0, remaining: 0, liked: 0, replied: 0 };
    }
    
    // Extract counter values from the UI
    const getCounterValue = (testId: string): number => {
      const counter = sidebar.shadowRoot!.querySelector(`[data-testid="${testId}"]`);
      return parseInt(counter?.textContent || '0', 10);
    };
    
    return {
      processed: getCounterValue('counter-processed'),
      remaining: getCounterValue('counter-remaining'),
      liked: getCounterValue('counter-likes'),
      replied: getCounterValue('counter-replies')
    };
  });
}

test.describe('Pipeline Controls E2E', () => {
  // Test fixture: LinkedIn post URL with comments
  const TEST_POST_URL = 'https://www.linkedin.com/feed/update/urn:li:activity:7368619407989760000/';
  
  test.beforeEach(async ({ page, context, extensionId }) => {
    // Navigate to the test post
    await page.goto(TEST_POST_URL);
    
    // Wait for the page to fully load
    await page.waitForLoadState('networkidle');
    
    // Wait for the sidebar to be injected
    await waitForSidebar(page);
    
    // Verify initial state is idle
    const initialState = await getPipelineStatus(page);
    expect(['idle', 'unknown']).toContain(initialState);
  });

  test('should start pipeline from idle state', async ({ page, background }) => {
    // Arrange: Verify initial idle state
    await waitForStateChange(page, 'idle', 5000);
    expect(await isButtonVisible(page, 'start-button')).toBe(true);
    expect(await isButtonVisible(page, 'stop-button')).toBe(false);
    expect(await isButtonVisible(page, 'resume-button')).toBe(false);
    
    // Act: Click the Start button
    await clickShadowButton(page, 'start-button');
    
    // Assert: Wait for state change to running
    await waitForStateChange(page, 'running', 10000);
    
    // Verify UI state changes
    expect(await isButtonVisible(page, 'start-button')).toBe(false);
    expect(await isButtonVisible(page, 'stop-button')).toBe(true);
    expect(await isButtonVisible(page, 'resume-button')).toBe(false);
    
    // Verify background state
    await verifyBackgroundState(background, 'running');
    
    // Verify that processing has started (counters should start updating)
    await page.waitForTimeout(2000); // Give it time to process at least one action
    const stats = await getProcessingStats(page);
    expect(stats.processed + stats.remaining).toBeGreaterThan(0);
  });

  test('should stop running pipeline', async ({ page, background }) => {
    // Arrange: Start the pipeline first
    await clickShadowButton(page, 'start-button');
    await waitForStateChange(page, 'running', 10000);
    
    // Wait for at least one comment to be processed
    await page.waitForFunction(
      () => {
        const sidebar = document.querySelector('[data-testid="linkedin-assistant-sidebar"]');
        if (!sidebar || !sidebar.shadowRoot) return false;
        const counter = sidebar.shadowRoot.querySelector('[data-testid="counter-processed"]');
        return parseInt(counter?.textContent || '0', 10) > 0;
      },
      { timeout: 15000 }
    );
    
    // Capture stats before stopping
    const statsBefore = await getProcessingStats(page);
    
    // Act: Click the Stop button
    await clickShadowButton(page, 'stop-button');
    
    // Assert: Wait for state change to paused
    await waitForStateChange(page, 'paused', 10000);
    
    // Verify UI state changes
    expect(await isButtonVisible(page, 'start-button')).toBe(false);
    expect(await isButtonVisible(page, 'stop-button')).toBe(false);
    expect(await isButtonVisible(page, 'resume-button')).toBe(true);
    
    // Verify background state
    await verifyBackgroundState(background, 'paused');
    
    // Wait a bit to ensure no new processing happens
    await page.waitForTimeout(3000);
    
    // Verify that processing has stopped (counters should not change)
    const statsAfter = await getProcessingStats(page);
    expect(statsAfter.processed).toBe(statsBefore.processed);
    
    // Verify state is persisted to storage
    const storedState = await page.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.storage.local.get(['postState'], (result) => {
          resolve(result.postState);
        });
      });
    });
    expect(storedState).toBeTruthy();
  });

  test('should resume paused pipeline', async ({ page, background }) => {
    // Arrange: Start and then stop the pipeline
    await clickShadowButton(page, 'start-button');
    await waitForStateChange(page, 'running', 10000);
    
    // Wait for some processing
    await page.waitForTimeout(3000);
    const statsBeforeStop = await getProcessingStats(page);
    
    await clickShadowButton(page, 'stop-button');
    await waitForStateChange(page, 'paused', 10000);
    
    // Act: Click the Resume button
    await clickShadowButton(page, 'resume-button');
    
    // Assert: Wait for state change back to running
    await waitForStateChange(page, 'running', 10000);
    
    // Verify UI state changes
    expect(await isButtonVisible(page, 'start-button')).toBe(false);
    expect(await isButtonVisible(page, 'stop-button')).toBe(true);
    expect(await isButtonVisible(page, 'resume-button')).toBe(false);
    
    // Verify background state
    await verifyBackgroundState(background, 'running');
    
    // Wait for additional processing
    await page.waitForTimeout(3000);
    
    // Verify that processing continues from where it left off
    const statsAfterResume = await getProcessingStats(page);
    expect(statsAfterResume.processed).toBeGreaterThanOrEqual(statsBeforeStop.processed);
    
    // Verify no duplicate processing (the processed count should continue, not reset)
    expect(statsAfterResume.liked).toBeGreaterThanOrEqual(statsBeforeStop.liked);
  });

  test('should handle rapid button clicks gracefully', async ({ page }) => {
    // Test debouncing - rapid clicks shouldn't cause issues
    
    // Start the pipeline
    await clickShadowButton(page, 'start-button');
    
    // Rapidly click stop multiple times
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        const sidebar = document.querySelector('[data-testid="linkedin-assistant-sidebar"]');
        if (sidebar && sidebar.shadowRoot) {
          const button = sidebar.shadowRoot.querySelector('[data-testid="stop-button"]') as HTMLButtonElement;
          if (button) button.click();
        }
      });
      await page.waitForTimeout(50);
    }
    
    // Should end up in paused state
    await waitForStateChange(page, 'paused', 10000);
    
    // Rapidly click resume multiple times
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        const sidebar = document.querySelector('[data-testid="linkedin-assistant-sidebar"]');
        if (sidebar && sidebar.shadowRoot) {
          const button = sidebar.shadowRoot.querySelector('[data-testid="resume-button"]') as HTMLButtonElement;
          if (button) button.click();
        }
      });
      await page.waitForTimeout(50);
    }
    
    // Should end up in running state
    await waitForStateChange(page, 'running', 10000);
    
    // Verify the pipeline is still functional
    const stats = await getProcessingStats(page);
    expect(stats.processed + stats.remaining).toBeGreaterThan(0);
  });

  test('should recover state after page reload', async ({ page, context }) => {
    // Start the pipeline and let it process some comments
    await clickShadowButton(page, 'start-button');
    await waitForStateChange(page, 'running', 10000);
    
    // Wait for some processing
    await page.waitForFunction(
      () => {
        const sidebar = document.querySelector('[data-testid="linkedin-assistant-sidebar"]');
        if (!sidebar || !sidebar.shadowRoot) return false;
        const counter = sidebar.shadowRoot.querySelector('[data-testid="counter-processed"]');
        return parseInt(counter?.textContent || '0', 10) >= 2;
      },
      { timeout: 20000 }
    );
    
    // Stop the pipeline
    await clickShadowButton(page, 'stop-button');
    await waitForStateChange(page, 'paused', 10000);
    
    const statsBeforeReload = await getProcessingStats(page);
    
    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForSidebar(page);
    
    // Wait for state to be restored
    await page.waitForTimeout(2000);
    
    // Verify the state is recovered
    const currentState = await getPipelineStatus(page);
    expect(currentState).toBe('paused');
    
    // Verify the stats are preserved
    const statsAfterReload = await getProcessingStats(page);
    expect(statsAfterReload.processed).toBe(statsBeforeReload.processed);
    expect(statsAfterReload.liked).toBe(statsBeforeReload.liked);
    
    // Verify we can resume from the recovered state
    await clickShadowButton(page, 'resume-button');
    await waitForStateChange(page, 'running', 10000);
  });

  test('should show error state on failure', async ({ page, background }) => {
    // Simulate an error condition by invalidating the API key
    await page.evaluate(() => {
      chrome.storage.sync.set({ 
        aiConfig: { 
          apiKey: 'invalid-key-to-trigger-error' 
        } 
      });
    });
    
    // Start the pipeline
    await clickShadowButton(page, 'start-button');
    
    // Wait for the pipeline to encounter an error
    // The pipeline should transition to error state when API calls fail
    await page.waitForFunction(
      () => {
        const sidebar = document.querySelector('[data-testid="linkedin-assistant-sidebar"]');
        if (!sidebar || !sidebar.shadowRoot) return false;
        const status = sidebar.shadowRoot.querySelector('[data-testid="pipeline-status"]');
        return status?.textContent?.toLowerCase() === 'error';
      },
      { timeout: 20000 }
    );
    
    // Verify error state UI
    expect(await isButtonVisible(page, 'error-button')).toBe(true);
    
    // Verify error is logged
    const logs = await page.evaluate(() => {
      const sidebar = document.querySelector('[data-testid="linkedin-assistant-sidebar"]');
      if (!sidebar || !sidebar.shadowRoot) return [];
      const logEntries = sidebar.shadowRoot.querySelectorAll('[data-testid^="log-entry-"]');
      return Array.from(logEntries).map(entry => entry.textContent);
    });
    
    const errorLogs = logs.filter(log => log?.toLowerCase().includes('error'));
    expect(errorLogs.length).toBeGreaterThan(0);
  });

  test('should update pipeline progress rows in real-time', async ({ page }) => {
    // Start the pipeline
    await clickShadowButton(page, 'start-button');
    await waitForStateChange(page, 'running', 10000);
    
    // Monitor pipeline progress rows
    const progressRows = await page.evaluate(() => {
      return new Promise((resolve) => {
        const sidebar = document.querySelector('[data-testid="linkedin-assistant-sidebar"]');
        if (!sidebar || !sidebar.shadowRoot) {
          resolve([]);
          return;
        }
        
        // Collect progress updates over 5 seconds
        const updates: any[] = [];
        const startTime = Date.now();
        
        const checkProgress = () => {
          const rows = sidebar.shadowRoot!.querySelectorAll('[data-testid^="pipeline-row-"]');
          rows.forEach(row => {
            const commentId = row.getAttribute('data-comment-id');
            const status = row.querySelector('[data-testid="status-indicator"]')?.textContent;
            updates.push({ commentId, status, timestamp: Date.now() - startTime });
          });
          
          if (Date.now() - startTime < 5000) {
            setTimeout(checkProgress, 500);
          } else {
            resolve(updates);
          }
        };
        
        checkProgress();
      });
    });
    
    // Verify that we captured state transitions
    expect(progressRows).toBeInstanceOf(Array);
    expect((progressRows as any[]).length).toBeGreaterThan(0);
    
    // Verify state transitions follow the expected pattern
    const transitions = new Set((progressRows as any[]).map(r => r.status));
    const expectedStates = ['Queued', 'Liked', 'Replied'];
    const hasExpectedTransitions = expectedStates.some(state => transitions.has(state));
    expect(hasExpectedTransitions).toBe(true);
  });

  test.afterEach(async ({ page }) => {
    // Clean up: Stop the pipeline if it's running
    try {
      const state = await getPipelineStatus(page);
      if (state === 'running') {
        await clickShadowButton(page, 'stop-button');
        await waitForStateChange(page, 'paused', 5000);
      }
    } catch (error) {
      // Ignore errors during cleanup
      console.log('Cleanup error (non-critical):', error);
    }
    
    // Clear storage for next test
    await page.evaluate(() => {
      chrome.storage.local.clear();
    });
  });
});

// Additional test suite for edge cases and error scenarios
test.describe('Pipeline Controls - Edge Cases', () => {
  const TEST_POST_URL = 'https://www.linkedin.com/feed/update/urn:li:activity:7368619407989760000/';
  
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_POST_URL);
    await page.waitForLoadState('networkidle');
    await waitForSidebar(page);
  });

  test('should handle empty comment list gracefully', async ({ page }) => {
    // Mock an empty comment list
    await page.evaluate(() => {
      // Override the DOM to return no comments
      const originalQuerySelectorAll = document.querySelectorAll.bind(document);
      document.querySelectorAll = function(selector: string) {
        if (selector.includes('comments-comment-entity')) {
          return [] as any;
        }
        return originalQuerySelectorAll(selector);
      };
    });
    
    // Start the pipeline
    await clickShadowButton(page, 'start-button');
    
    // Should quickly transition to idle as there's nothing to process
    await page.waitForTimeout(2000);
    const state = await getPipelineStatus(page);
    expect(state).toBe('idle');
    
    // Verify appropriate message is shown
    const message = await page.evaluate(() => {
      const sidebar = document.querySelector('[data-testid="linkedin-assistant-sidebar"]');
      if (!sidebar || !sidebar.shadowRoot) return '';
      const msgElement = sidebar.shadowRoot.querySelector('[data-testid="status-message"]');
      return msgElement?.textContent || '';
    });
    
    expect(message.toLowerCase()).toContain('no comments');
  });

  test('should respect max replies limit', async ({ page }) => {
    // Set a low max replies limit
    await page.evaluate(() => {
      const sidebar = document.querySelector('[data-testid="linkedin-assistant-sidebar"]');
      if (sidebar && sidebar.shadowRoot) {
        const input = sidebar.shadowRoot.querySelector('[data-testid="max-replies-input"]') as HTMLInputElement;
        if (input) {
          input.value = '2';
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
    
    // Start the pipeline
    await clickShadowButton(page, 'start-button');
    await waitForStateChange(page, 'running', 10000);
    
    // Wait for the limit to be reached
    await page.waitForFunction(
      () => {
        const sidebar = document.querySelector('[data-testid="linkedin-assistant-sidebar"]');
        if (!sidebar || !sidebar.shadowRoot) return false;
        const counter = sidebar.shadowRoot.querySelector('[data-testid="counter-replies"]');
        return parseInt(counter?.textContent || '0', 10) >= 2;
      },
      { timeout: 30000 }
    );
    
    // Pipeline should stop automatically
    await waitForStateChange(page, 'idle', 10000);
    
    // Verify exactly 2 replies were sent
    const stats = await getProcessingStats(page);
    expect(stats.replied).toBe(2);
  });
});