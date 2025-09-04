import { test, expect } from './fixtures';

test.describe('AI Settings Persistence', () => {
  // Define mock data to be used in the test.
  const MOCK_API_KEY = 'sk-or-playwright-test-key-123456';
  const MOCK_SELECTED_MODEL_ID = 'mock/model-2';
  const MOCK_REPLY_PROMPT = 'This is a test reply prompt from Playwright.';
  const MOCK_DM_PROMPT = 'This is a test DM prompt from Playwright.';
  const MOCK_TEMPERATURE = '0.5';

  test('should save and restore settings after page reload', async ({
    page,
  }) => {
    // 1. Mock the chrome.runtime.sendMessage API to intercept model fetching.
    // This makes the test independent of the actual OpenRouter API.
    await page.addInitScript(() => {
      const originalSendMessage = chrome.runtime.sendMessage;
      (window.chrome.runtime as any).sendMessage = function (...args: any[]) {
        const message = args[0];
        const callback =
          typeof args[args.length - 1] === 'function'
            ? args[args.length - 1]
            : undefined;

        if (
          typeof message === 'object' &&
          message !== null &&
          message.type === 'GET_MODELS'
        ) {
          if (callback) {
            callback({
              status: 'success',
              payload: [
                { id: 'mock/model-1', name: 'Mock Model One' },
                { id: 'mock/model-2', name: 'Mock Model Two (Selected)' },
                { id: 'mock/model-3', name: 'Mock Model Three' },
              ],
            });
          }
          return;
        }
        // Forward all other messages to the original function.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - Overriding sendMessage with a dynamic mock is complex to type.
        return originalSendMessage.apply(this, args);
      };
    });

    // 2. Navigate to a LinkedIn page to trigger the extension's content script.
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded',
    });

    // 3. Wait for the sidebar to be injected and visible.
    const sidebar = page.locator('div.sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // --- PHASE 1: INPUT AND SAVE SETTINGS ---

    // 4. Locate all the UI elements for AI settings.
    const apiKeyInput = sidebar.locator('#apiKey');
    const testButton = sidebar.locator('button', { hasText: 'Test' });
    const modelSelect = sidebar.locator('#model');
    const replyPromptInput = sidebar.locator('#replyPrompt');
    const dmPromptInput = sidebar.locator('#dmPrompt');
    const temperatureSlider = sidebar.locator('#temperature');
    const saveButton = sidebar.locator('button', { hasText: 'Save' });

    // 5. Fill in the form with our mock data.
    await apiKeyInput.fill(MOCK_API_KEY);
    await testButton.click(); // This triggers the mocked GET_MODELS call.

    // 6. Wait for the model dropdown to be populated and select a model.
    await expect(
      modelSelect.locator(`option[value="${MOCK_SELECTED_MODEL_ID}"]`)
    ).toBeVisible();
    await modelSelect.selectOption(MOCK_SELECTED_MODEL_ID);

    // 7. Fill in the prompt text areas.
    await replyPromptInput.fill(MOCK_REPLY_PROMPT);
    await dmPromptInput.fill(MOCK_DM_PROMPT);

    // 8. Set the temperature slider's value.
    await temperatureSlider.evaluate((el, value) => {
      (el as HTMLInputElement).value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, MOCK_TEMPERATURE);

    // 9. Click the "Save" button to persist the settings.
    await saveButton.click();

    // --- PHASE 2: RELOAD AND VERIFY PERSISTENCE ---

    // 10. Reload the page to simulate a new session.
    await page.reload();

    // 11. Wait for the sidebar to reappear after the reload.
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // 12. Re-locate the elements to get fresh handles.
    const apiKeyInputAfter = sidebar.locator('#apiKey');
    const modelSelectAfter = sidebar.locator('#model');
    const replyPromptInputAfter = sidebar.locator('#replyPrompt');
    const dmPromptInputAfter = sidebar.locator('#dmPrompt');
    const temperatureSliderAfter = sidebar.locator('#temperature');

    // 13. Assert that all input fields have retained their values.
    await expect(apiKeyInputAfter).toHaveValue(MOCK_API_KEY);
    await expect(modelSelectAfter).toHaveValue(MOCK_SELECTED_MODEL_ID);
    await expect(temperatureSliderAfter).toHaveValue(MOCK_TEMPERATURE);
    await expect(replyPromptInputAfter).toHaveValue(MOCK_REPLY_PROMPT);
    await expect(dmPromptInputAfter).toHaveValue(MOCK_DM_PROMPT);
  });
});