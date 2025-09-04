import { test, expect } from './fixtures';

test.describe('AI Settings Persistence', () => {
  test('should save settings, reload, and verify they are persisted', async ({
    page,
  }) => {
    // Define mock data for the test
    const MOCK_API_KEY = 'sk-or-playwright-test-key-12345';
    const MOCK_MODEL_ID = 'mock/model-2';
    const MOCK_REPLY_PROMPT = 'This is a test reply prompt from Playwright.';
    const MOCK_DM_PROMPT = 'This is a test DM prompt from Playwright.';
    const MOCK_TEMPERATURE = '0.9';
    const MOCK_TOP_P = '0.3';

    // 1. Navigate to a valid page and wait for the extension's UI to be injected.
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded',
    });
    const sidebarLocator = page.locator('#linkedin-engagement-assistant-root');
    await expect(sidebarLocator).toBeAttached({ timeout: 15000 });

    // 2. Define locators for all UI elements to be tested. Using IDs for stability.
    const apiKeyInput = sidebarLocator.locator('#apiKey');
    const testButton = sidebarLocator.locator('button:text("Test")');
    const modelSelect = sidebarLocator.locator('#model');
    const replyPromptTextarea = sidebarLocator.locator('#replyPrompt');
    const dmPromptTextarea = sidebarLocator.locator('#dmPrompt');
    const temperatureSlider = sidebarLocator.locator('#temperature');
    const topPSlider = sidebarLocator.locator('#topP');
    const saveButton = sidebarLocator.locator('button.save-button');

    // 3. ACT: Input data into the settings form and save it.
    await test.step('Input and save settings', async () => {
      // Fill in the API key and click 'Test' to trigger the mocked model fetch.
      await apiKeyInput.fill(MOCK_API_KEY);
      await testButton.click();

      // Wait for the model dropdown to be enabled and populated by the mock.
      await expect(modelSelect).toBeEnabled({ timeout: 5000 });
      await expect(
        sidebarLocator.locator('option:text("Mock Model One")')
      ).toBeVisible();

      // Select a model and fill in the other fields.
      await modelSelect.selectOption({ value: MOCK_MODEL_ID });
      await replyPromptTextarea.fill(MOCK_REPLY_PROMPT);
      await dmPromptTextarea.fill(MOCK_DM_PROMPT);

      // Programmatically set slider values and dispatch an 'input' event
      // to ensure the component's state is updated correctly.
      await temperatureSlider.evaluate((el, value) => {
        (el as HTMLInputElement).value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, MOCK_TEMPERATURE);

      await topPSlider.evaluate((el, value) => {
        (el as HTMLInputElement).value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, MOCK_TOP_P);

      // Save the settings.
      await saveButton.click();

      // A quick check to ensure the save message was likely processed before reloading.
      await expect(apiKeyInput).toHaveValue(MOCK_API_KEY);
    });

    // 4. RELOAD: Simulate a new session by reloading the page.
    await test.step('Reload the page and wait for sidebar', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      // Wait for the extension to re-inject the sidebar.
      await expect(sidebarLocator).toBeAttached({ timeout: 15000 });
    });

    // 5. ASSERT: Verify that all the settings were loaded from storage and
    // are correctly displayed in the UI.
    await test.step('Verify settings are persisted', async () => {
      // Playwright's `toHaveValue` has built-in waiting, which handles the
      // asynchronous loading of settings from chrome.storage.
      await expect(apiKeyInput).toHaveValue(MOCK_API_KEY);

      // The model *list* won't be populated until 'Test' is clicked again,
      // but the *selected value* should be persisted and loaded correctly.
      await expect(modelSelect).toHaveValue(MOCK_MODEL_ID);

      await expect(replyPromptTextarea).toHaveValue(MOCK_REPLY_PROMPT);
      await expect(dmPromptTextarea).toHaveValue(MOCK_DM_PROMPT);
      await expect(temperatureSlider).toHaveValue(MOCK_TEMPERATURE);
      await expect(topPSlider).toHaveValue(MOCK_TOP_P);
    });
  });
});