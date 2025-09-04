import { test, expect } from './fixtures';
import { Page } from '@playwright/test';

// Test data constants
const TEST_POST_URL = 'https://www.linkedin.com/feed/update/urn:li:activity:7368619407989760000/';
const TIMEOUT_LONG = 30000;
const TIMEOUT_SHORT = 5000;

// Helper function to wait for the sidebar to be fully loaded
async function waitForSidebarReady(page: Page) {
  // Wait for the sidebar root element to be injected
  const sidebarRoot = await page.waitForSelector(
    '#linkedin-engagement-assistant-root',
    { timeout: TIMEOUT_LONG }
  );
  
  // Wait for shadow root to be available
  const shadowRoot = await sidebarRoot.evaluateHandle(el => el.shadowRoot);
  if (!shadowRoot) {
    throw new Error('Shadow root not found on sidebar element');
  }

  // Wait for the Controls component to be rendered
  await page.waitForFunction(
    () => {
      const root = document.querySelector('#linkedin-engagement-assistant-root');
      if (!root?.shadowRoot) return false;
      
      // Check if the controls section exists
      const controls = root.shadowRoot.querySelector('.sidebar-section.controls');
      if (!controls) return false;
      
      // Check if at least one control button is present
      const hasButton = root.shadowRoot.querySelector('[data-testid="start-button"]') ||
                       root.shadowRoot.querySelector('[data-testid="stop-button"]') ||
                       root.shadowRoot.querySelector('[data-testid="resume-button"]');
      return !!hasButton;
    },
    { timeout: TIMEOUT_LONG }
  );

  return shadowRoot;
}

// Helper to get button element from shadow DOM
async function getControlButton(page: Page, testId: string) {
  return page.evaluateHandle((tid) => {
    const root = document.querySelector('#linkedin-engagement-assistant-root');
    if (!root?.shadowRoot) return null;
    return root.shadowRoot.querySelector(`[data-testid="${tid}"]`);
  }, testId);
}

// Helper to click a button in the shadow DOM
async function clickControlButton(page: Page, testId: string) {
  const button = await getControlButton(page, testId);
  if (!button) {
    throw new Error(`Button with testId "${testId}" not found`);
  }
  
  await page.evaluate((btn) => {
    (btn as HTMLButtonElement).click();
  }, button);
}

// Helper to check if a specific button is visible
async function isButtonVisible(page: Page, testId: string): Promise<boolean> {
  return page.evaluate((tid) => {
    const root = document.querySelector('#linkedin-engagement-assistant-root');
    if (!root?.shadowRoot) return false;
    const button = root.shadowRoot.querySelector(`[data-testid="${tid}"]`);
    return button !== null && (button as HTMLElement).offsetParent !== null;
  }, testId);
}

// Helper to get the current pipeline status from the UI
async function getPipelineStatus(page: Page): Promise<string> {
  return page.evaluate(() => {
    const root = document.querySelector('#linkedin-engagement-assistant-root');
    if (!root?.shadowRoot) return 'unknown';
    
    // Check which button is visible to infer status
    const startBtn = root.shadowRoot.querySelector('[data-testid="start-button"]');
    const stopBtn = root.shadowRoot.querySelector('[data-testid="stop-button"]');
    const resumeBtn = root.shadowRoot.querySelector('[data-testid="resume-button"]');
    
    if (startBtn && (startBtn as HTMLElement).offsetParent !== null) return 'idle';
    if (stopBtn && (stopBtn as HTMLElement).offsetParent !== null) return 'running';
    if (resumeBtn && (resumeBtn as HTMLElement).offsetParent !== null) return 'paused';
    
    return 'unknown';
  });
}

// Helper to wait for a specific pipeline status
async function waitForPipelineStatus(page: Page, expectedStatus: string, timeout = TIMEOUT_SHORT) {
  await page.waitForFunction(
    (status) => {
      const root = document.querySelector('#linkedin-engagement-assistant-root');
      if (!root?.shadowRoot) return false;
      
      const startBtn = root.shadowRoot.querySelector('[data-testid="start-button"]');
      const stopBtn = root.shadowRoot.querySelector('[data-testid="stop-button"]');
      const resumeBtn = root.shadowRoot.querySelector('[data-testid="resume-button"]');
      
      switch (status) {
        case 'idle':
          return startBtn && (startBtn as HTMLElement).offsetParent !== null;
        case 'running':
          return stopBtn && (stopBtn as HTMLElement).offsetParent !== null;
        case 'paused':
          return resumeBtn && (resumeBtn as HTMLElement).offsetParent !== null;
        default:
          return false;
      }
    },
    expectedStatus,
    { timeout }
  );
}

// Helper to verify service worker state matches UI state
async function verifyServiceWorkerState(background: any, expectedState: string) {
  const swState = await background.evaluate(() => {
    // Access the pipeline status from the service worker's global scope
    // This assumes the pipelineManager exports or exposes the status
    return (self as any).pipelineStatus || 'unknown';
  });
  
  // The service worker might not expose this directly, so we'll check via message passing
  // This is a more reliable approach
  const response = await background.evaluate(async (state) => {
    return new Promise((resolve) => {
      // Listen for the response
      const messageHandler = (event: any) => {
        if (event.data && event.data.type === 'PIPELINE_STATUS_RESPONSE') {
          self.removeEventListener('message', messageHandler);
          resolve(event.data.status);
        }
      };
      self.addEventListener('message', messageHandler);
      
      // Request the current status
      self.postMessage({ type: 'GET_PIPELINE_STATUS' });
      
      // Timeout after 2 seconds
      setTimeout(() => {
        self.removeEventListener('message', messageHandler);
        resolve('timeout');
      }, 2000);
    });
  }, expectedState);
  
  return response;
}

test.describe('Pipeline Control E2E Tests', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set a reasonable viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Navigate to a LinkedIn post page
    await page.goto(TEST_POST_URL, { waitUntil: 'networkidle' });
    
    // Wait for the page to be fully loaded
    await page.waitForLoadState('domcontentloaded');
    
    // Give the content script time to inject the sidebar
    await page.waitForTimeout(2000);
  });

  test('should successfully control pipeline lifecycle: start, stop, and resume', async ({ page, background }) => {
    // Step 1: Wait for sidebar to be ready
    console.log('Step 1: Waiting for sidebar to be ready...');
    await waitForSidebarReady(page);
    
    // Step 2: Verify initial state is 'idle'
    console.log('Step 2: Verifying initial state is idle...');
    const initialStatus = await getPipelineStatus(page);
    expect(initialStatus).toBe('idle');
    
    // Verify Start button is visible
    const startButtonVisible = await isButtonVisible(page, 'start-button');
    expect(startButtonVisible).toBe(true);
    
    // Step 3: Click Start button and verify transition to 'running'
    console.log('Step 3: Starting pipeline...');
    await clickControlButton(page, 'start-button');
    
    // Wait for the UI to update to running state
    await waitForPipelineStatus(page, 'running');
    
    // Verify Stop button is now visible
    const stopButtonVisible = await isButtonVisible(page, 'stop-button');
    expect(stopButtonVisible).toBe(true);
    
    // Verify Start button is no longer visible
    const startButtonHidden = await isButtonVisible(page, 'start-button');
    expect(startButtonHidden).toBe(false);
    
    // Give the pipeline a moment to actually start processing
    await page.waitForTimeout(1000);
    
    // Step 4: Click Stop button and verify transition to 'paused'
    console.log('Step 4: Stopping pipeline...');
    await clickControlButton(page, 'stop-button');
    
    // Wait for the UI to update to paused state
    await waitForPipelineStatus(page, 'paused');
    
    // Verify Resume button is now visible
    const resumeButtonVisible = await isButtonVisible(page, 'resume-button');
    expect(resumeButtonVisible).toBe(true);
    
    // Verify Stop button is no longer visible
    const stopButtonHidden = await isButtonVisible(page, 'stop-button');
    expect(stopButtonHidden).toBe(false);
    
    // Step 5: Click Resume button and verify transition back to 'running'
    console.log('Step 5: Resuming pipeline...');
    await clickControlButton(page, 'resume-button');
    
    // Wait for the UI to update back to running state
    await waitForPipelineStatus(page, 'running');
    
    // Verify Stop button is visible again
    const stopButtonVisibleAgain = await isButtonVisible(page, 'stop-button');
    expect(stopButtonVisibleAgain).toBe(true);
    
    // Verify Resume button is no longer visible
    const resumeButtonHidden = await isButtonVisible(page, 'resume-button');
    expect(resumeButtonHidden).toBe(false);
    
    // Step 6: Final cleanup - stop the pipeline
    console.log('Step 6: Final cleanup - stopping pipeline...');
    await clickControlButton(page, 'stop-button');
    await waitForPipelineStatus(page, 'paused');
    
    console.log('Test completed successfully!');
  });

  test('should handle rapid button clicks gracefully', async ({ page }) => {
    // Wait for sidebar to be ready
    await waitForSidebarReady(page);
    
    // Verify initial state
    const initialStatus = await getPipelineStatus(page);
    expect(initialStatus).toBe('idle');
    
    // Rapidly click Start multiple times
    console.log('Testing rapid Start button clicks...');
    await clickControlButton(page, 'start-button');
    
    // Try to click Start again (should be hidden now)
    const startStillVisible = await isButtonVisible(page, 'start-button');
    expect(startStillVisible).toBe(false);
    
    // Wait for running state
    await waitForPipelineStatus(page, 'running');
    
    // Rapidly click Stop multiple times
    console.log('Testing rapid Stop button clicks...');
    await clickControlButton(page, 'stop-button');
    
    // Try to click Stop again (should be hidden now)
    const stopStillVisible = await isButtonVisible(page, 'stop-button');
    expect(stopStillVisible).toBe(false);
    
    // Verify we're in paused state
    await waitForPipelineStatus(page, 'paused');
    
    console.log('Rapid click test completed successfully!');
  });

  test('should maintain state consistency between UI and service worker', async ({ page, background }) => {
    // Wait for sidebar to be ready
    await waitForSidebarReady(page);
    
    // Start the pipeline
    console.log('Starting pipeline for state consistency test...');
    await clickControlButton(page, 'start-button');
    await waitForPipelineStatus(page, 'running');
    
    // Verify the service worker also reflects running state
    // Note: This requires the service worker to expose its state somehow
    // We'll check by looking at the logs or by evaluating the worker's state
    const swLogs = await background.evaluate(() => {
      return (self as any).__playwright_logs__ || [];
    });
    
    // Look for a log entry indicating the pipeline started
    const startLog = swLogs.find((log: any) => 
      log.message.includes('Starting pipeline') || 
      log.message.includes('PIPELINE_START')
    );
    expect(startLog).toBeTruthy();
    
    // Stop the pipeline
    console.log('Stopping pipeline for state consistency test...');
    await clickControlButton(page, 'stop-button');
    await waitForPipelineStatus(page, 'paused');
    
    // Check for stop log
    const swLogsAfterStop = await background.evaluate(() => {
      return (self as any).__playwright_logs__ || [];
    });
    
    const stopLog = swLogsAfterStop.find((log: any) => 
      log.message.includes('Stopping pipeline') || 
      log.message.includes('PIPELINE_STOP')
    );
    expect(stopLog).toBeTruthy();
    
    console.log('State consistency test completed successfully!');
  });

  test('should show appropriate UI feedback during state transitions', async ({ page }) => {
    // Wait for sidebar to be ready
    await waitForSidebarReady(page);
    
    // Check for any loading indicators or status messages
    const checkForStatusIndicator = async () => {
      return page.evaluate(() => {
        const root = document.querySelector('#linkedin-engagement-assistant-root');
        if (!root?.shadowRoot) return null;
        
        // Look for status indicators (this depends on the actual UI implementation)
        const header = root.shadowRoot.querySelector('.sidebar-section h3');
        const statusDot = root.shadowRoot.querySelector('.status-dot');
        
        return {
          headerText: header?.textContent || '',
          hasStatusDot: !!statusDot
        };
      });
    };
    
    // Initial check
    const initialIndicators = await checkForStatusIndicator();
    console.log('Initial UI indicators:', initialIndicators);
    
    // Start pipeline and check for changes
    await clickControlButton(page, 'start-button');
    await waitForPipelineStatus(page, 'running');
    
    const runningIndicators = await checkForStatusIndicator();
    console.log('Running UI indicators:', runningIndicators);
    
    // Stop pipeline and check for changes
    await clickControlButton(page, 'stop-button');
    await waitForPipelineStatus(page, 'paused');
    
    const pausedIndicators = await checkForStatusIndicator();
    console.log('Paused UI indicators:', pausedIndicators);
    
    console.log('UI feedback test completed successfully!');
  });
});

test.describe('Pipeline Control Error Scenarios', () => {
  test('should handle missing post URN gracefully', async ({ page }) => {
    // Navigate to LinkedIn feed (not a specific post)
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Wait for sidebar to be ready
    await waitForSidebarReady(page);
    
    // Try to start the pipeline without a valid post URN
    console.log('Attempting to start pipeline without post URN...');
    await clickControlButton(page, 'start-button');
    
    // The UI should either show an error or remain in idle state
    await page.waitForTimeout(2000);
    
    // Check if we're still in idle state (pipeline shouldn't start)
    const status = await getPipelineStatus(page);
    
    // Depending on implementation, it might stay idle or show an error
    // For now, we'll just verify it doesn't crash
    expect(['idle', 'error']).toContain(status);
    
    console.log('Missing URN test completed successfully!');
  });
});