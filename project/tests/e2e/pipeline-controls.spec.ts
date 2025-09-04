import { test, expect } from './fixtures';
import type { Page, Frame } from '@playwright/test';

/**
 * Helper to wait for the sidebar to be injected and return its shadow root frame
 */
async function waitForSidebar(page: Page, timeout = 30000): Promise<Frame | null> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    // Look for the sidebar container element
    const sidebarHost = await page.locator('#linkedin-assistant-sidebar').first();
    
    if (await sidebarHost.count() > 0) {
      // Get the shadow root - Playwright doesn't directly support shadow DOM traversal,
      // so we need to use evaluate
      const hasShadowRoot = await sidebarHost.evaluate((el) => {
        return !!el.shadowRoot;
      });
      
      if (hasShadowRoot) {
        return null; // We'll interact with shadow DOM via evaluate
      }
    }
    
    await page.waitForTimeout(500);
  }
  
  throw new Error('Sidebar not found within timeout');
}

/**
 * Helper to interact with elements inside the shadow DOM
 */
async function clickShadowElement(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const host = document.querySelector('#linkedin-assistant-sidebar');
    if (!host?.shadowRoot) throw new Error('Shadow root not found');
    const element = host.shadowRoot.querySelector(sel) as HTMLElement;
    if (!element) throw new Error(`Element ${sel} not found in shadow DOM`);
    element.click();
  }, selector);
}

/**
 * Helper to check if an element exists in the shadow DOM
 */
async function shadowElementExists(page: Page, selector: string): Promise<boolean> {
  return await page.evaluate((sel) => {
    const host = document.querySelector('#linkedin-assistant-sidebar');
    if (!host?.shadowRoot) return false;
    return !!host.shadowRoot.querySelector(sel);
  }, selector);
}

/**
 * Helper to get text content from shadow DOM element
 */
async function getShadowElementText(page: Page, selector: string): Promise<string> {
  return await page.evaluate((sel) => {
    const host = document.querySelector('#linkedin-assistant-sidebar');
    if (!host?.shadowRoot) throw new Error('Shadow root not found');
    const element = host.shadowRoot.querySelector(sel);
    if (!element) throw new Error(`Element ${sel} not found in shadow DOM`);
    return element.textContent || '';
  }, selector);
}

/**
 * Helper to wait for a specific pipeline status
 */
async function waitForPipelineStatus(
  page: Page,
  expectedStatus: 'idle' | 'running' | 'paused',
  timeout = 10000
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      // Check for status indicator in the UI
      const statusText = await getShadowElementText(page, '[data-testid="pipeline-status"]');
      
      if (statusText.toLowerCase().includes(expectedStatus)) {
        return true;
      }
      
      // Also check button visibility as a secondary indicator
      if (expectedStatus === 'idle') {
        const startVisible = await shadowElementExists(page, '[data-testid="start-button"]');
        if (startVisible) return true;
      } else if (expectedStatus === 'running') {
        const stopVisible = await shadowElementExists(page, '[data-testid="stop-button"]');
        if (stopVisible) return true;
      } else if (expectedStatus === 'paused') {
        const resumeVisible = await shadowElementExists(page, '[data-testid="resume-button"]');
        if (resumeVisible) return true;
      }
    } catch (e) {
      // Element might not exist yet, continue polling
    }
    
    await page.waitForTimeout(250);
  }
  
  return false;
}

/**
 * Helper to verify button visibility states
 */
async function verifyButtonStates(
  page: Page,
  expected: { start?: boolean; stop?: boolean; resume?: boolean }
): Promise<void> {
  if (expected.start !== undefined) {
    const startExists = await shadowElementExists(page, '[data-testid="start-button"]');
    expect(startExists).toBe(expected.start);
  }
  
  if (expected.stop !== undefined) {
    const stopExists = await shadowElementExists(page, '[data-testid="stop-button"]');
    expect(stopExists).toBe(expected.stop);
  }
  
  if (expected.resume !== undefined) {
    const resumeExists = await shadowElementExists(page, '[data-testid="resume-button"]');
    expect(resumeExists).toBe(expected.resume);
  }
}

test.describe('Pipeline Controls E2E', () => {
  let testPostUrl: string;
  
  test.beforeAll(() => {
    // Use a test LinkedIn post URL - can be a real one or mocked
    testPostUrl = 'https://www.linkedin.com/feed/update/urn:li:activity:7368611162063671296/';
  });
  
  test.beforeEach(async ({ context }) => {
    // Ensure we start fresh for each test
    await context.clearCookies();
    
    // Add LinkedIn auth cookie if available
    if (process.env.LINKEDIN_COOKIE) {
      await context.addCookies([{
        name: 'li_at',
        value: process.env.LINKEDIN_COOKIE,
        domain: '.linkedin.com',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'None' as const,
        expires: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
      }]);
    }
  });
  
  test('should handle Start → Stop → Resume flow correctly', async ({ page }) => {
    // Step 1: Navigate to LinkedIn post
    await page.goto(testPostUrl, { waitUntil: 'networkidle' });
    
    // Step 2: Wait for sidebar injection
    console.log('Waiting for sidebar to be injected...');
    await waitForSidebar(page);
    
    // Give the UI a moment to fully initialize
    await page.waitForTimeout(2000);
    
    // Step 3: Verify initial state (idle with Start button visible)
    console.log('Verifying initial idle state...');
    await verifyButtonStates(page, {
      start: true,
      stop: false,
      resume: false
    });
    
    const initialStatus = await waitForPipelineStatus(page, 'idle', 5000);
    expect(initialStatus).toBe(true);
    
    // Step 4: Click Start and verify transition to running
    console.log('Starting pipeline...');
    await clickShadowElement(page, '[data-testid="start-button"]');
    
    // Wait for state change with longer timeout as service worker needs to process
    const runningStatus = await waitForPipelineStatus(page, 'running', 10000);
    expect(runningStatus).toBe(true);
    
    await verifyButtonStates(page, {
      start: false,
      stop: true,
      resume: false
    });
    
    // Verify that counters or status indicators show running state
    const runningText = await getShadowElementText(page, '[data-testid="pipeline-status"]');
    expect(runningText.toLowerCase()).toContain('running');
    
    // Step 5: Click Stop and verify transition to paused
    console.log('Stopping pipeline...');
    await clickShadowElement(page, '[data-testid="stop-button"]');
    
    const pausedStatus = await waitForPipelineStatus(page, 'paused', 10000);
    expect(pausedStatus).toBe(true);
    
    await verifyButtonStates(page, {
      start: false,
      stop: false,
      resume: true
    });
    
    const pausedText = await getShadowElementText(page, '[data-testid="pipeline-status"]');
    expect(pausedText.toLowerCase()).toContain('paused');
    
    // Step 6: Click Resume and verify transition back to running
    console.log('Resuming pipeline...');
    await clickShadowElement(page, '[data-testid="resume-button"]');
    
    const resumedStatus = await waitForPipelineStatus(page, 'running', 10000);
    expect(resumedStatus).toBe(true);
    
    await verifyButtonStates(page, {
      start: false,
      stop: true,
      resume: false
    });
    
    const resumedText = await getShadowElementText(page, '[data-testid="pipeline-status"]');
    expect(resumedText.toLowerCase()).toContain('running');
    
    // Optional: Stop again to clean up
    await clickShadowElement(page, '[data-testid="stop-button"]');
    await waitForPipelineStatus(page, 'paused', 5000);
    
    console.log('Pipeline control test completed successfully!');
  });
  
  test('should maintain state after rapid Start/Stop clicks', async ({ page }) => {
    await page.goto(testPostUrl, { waitUntil: 'networkidle' });
    await waitForSidebar(page);
    await page.waitForTimeout(2000);
    
    // Rapid Start → Stop sequence
    await clickShadowElement(page, '[data-testid="start-button"]');
    await page.waitForTimeout(500); // Very short wait
    await clickShadowElement(page, '[data-testid="stop-button"]');
    
    // Should end in paused state
    const finalStatus = await waitForPipelineStatus(page, 'paused', 10000);
    expect(finalStatus).toBe(true);
    
    await verifyButtonStates(page, {
      start: false,
      stop: false,
      resume: true
    });
  });
  
  test('should handle multiple Resume/Stop cycles', async ({ page }) => {
    await page.goto(testPostUrl, { waitUntil: 'networkidle' });
    await waitForSidebar(page);
    await page.waitForTimeout(2000);
    
    // Start the pipeline
    await clickShadowElement(page, '[data-testid="start-button"]');
    await waitForPipelineStatus(page, 'running', 10000);
    
    // Perform multiple stop/resume cycles
    for (let i = 0; i < 3; i++) {
      console.log(`Cycle ${i + 1}: Stopping...`);
      await clickShadowElement(page, '[data-testid="stop-button"]');
      await waitForPipelineStatus(page, 'paused', 5000);
      
      console.log(`Cycle ${i + 1}: Resuming...`);
      await clickShadowElement(page, '[data-testid="resume-button"]');
      await waitForPipelineStatus(page, 'running', 5000);
    }
    
    // Final verification
    await verifyButtonStates(page, {
      start: false,
      stop: true,
      resume: false
    });
  });
  
  test('should show processing indicators when pipeline is running', async ({ page }) => {
    await page.goto(testPostUrl, { waitUntil: 'networkidle' });
    await waitForSidebar(page);
    await page.waitForTimeout(2000);
    
    // Start the pipeline
    await clickShadowElement(page, '[data-testid="start-button"]');
    await waitForPipelineStatus(page, 'running', 10000);
    
    // Check for processing indicators
    const hasProgressIndicator = await shadowElementExists(page, '[data-testid="pipeline-progress"]');
    expect(hasProgressIndicator).toBe(true);
    
    // Check if counters section exists and is visible
    const hasCounters = await shadowElementExists(page, '.sidebar-section.counters');
    expect(hasCounters).toBe(true);
    
    // Clean up
    await clickShadowElement(page, '[data-testid="stop-button"]');
    await waitForPipelineStatus(page, 'paused', 5000);
  });
});

// Additional test for error scenarios
test.describe('Pipeline Controls Error Handling', () => {
  test('should handle service worker communication failures gracefully', async ({ page }) => {
    const testPostUrl = 'https://www.linkedin.com/feed/update/urn:li:activity:7368611162063671296/';
    
    await page.goto(testPostUrl, { waitUntil: 'networkidle' });
    await waitForSidebar(page);
    await page.waitForTimeout(2000);
    
    // Simulate service worker being unresponsive by evaluating in page context
    await page.evaluate(() => {
      // Override chrome.runtime.sendMessage to simulate failure
      const originalSendMessage = chrome.runtime.sendMessage;
      (chrome.runtime as any).sendMessage = ((message: { type: string }, callback?: (response: { error?: string }) => void) => {
        if (message.type === 'START_PIPELINE') {
          // Simulate a timeout/error
          setTimeout(() => {
            if (callback) {
              callback({ error: 'Service worker timeout' });
            }
          }, 100);
          return;
        }
        return (originalSendMessage as any)(message, callback);
      }) as typeof chrome.runtime.sendMessage;
    });
    
    // Try to start pipeline - should handle error gracefully
    await clickShadowElement(page, '[data-testid="start-button"]');
    
    // Wait a bit for error handling
    await page.waitForTimeout(2000);
    
    // UI should still be responsive and show appropriate state
    const startButtonStillExists = await shadowElementExists(page, '[data-testid="start-button"]');
    expect(startButtonStillExists).toBe(true);
  });
});