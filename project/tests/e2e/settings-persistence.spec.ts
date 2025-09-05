import { test, expect } from './fixtures';

test.describe('AI Settings Persistence', () => {
  test('should save settings, reload, and verify they are persisted', async ({
    page,
    background,
  }) => {
    // Mock the API call to fetch AI models using the service worker's internal fetch mock.
    // This is more reliable than context.route for service worker fetches.
    await background.evaluate(() => {
      const selfWithMocks = self as unknown as {
        __E2E_MOCK_FETCH: (
          url: string,
          resp: { status: number; body: object }
        ) => void;
      };
      const mockModels = [
        { id: 'mock/model-1', name: 'Mock Model One', context_length: 16000 },
        {
          id: 'mock/model-2',
          name: 'Mock Model Two (Selected)',
          context_length: 32000,
        },
        { id: 'mock/model-3', name: 'Mock Model Three', context_length: 8001 },
      ];
      selfWithMocks.__E2E_MOCK_FETCH('/api/v1/models', {
        status: 200,
        body: { data: mockModels },
      });
    });

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

      // Assert that the options have been added to the DOM.
      // We check for count because options inside a select are not always "visible".
      await expect(modelSelect.locator('option')).toHaveCount(4); // 1 disabled placeholder + 3 mock models

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

      // Wait for the save operation to complete by looking for the success message.
      // This makes the test robust by ensuring the async save is finished before reloading.
      await expect(
        sidebarLocator.locator('[data-testid="save-success-msg"]')
      ).toBeVisible();
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