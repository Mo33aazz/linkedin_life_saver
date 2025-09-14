<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import type { OpenRouterModel, AIConfig } from '../../shared/types';

  let containerElement: HTMLElement;
  let formElements: HTMLElement[] = [];

  // UI state
  let saveMessage = '';
  let isAdvancedExpanded = false;
  let isAiEnabled = true; // Toggle for AI on/off

  // AI settings state
  let apiKey = '';
  let models: OpenRouterModel[] = [];
  let selectedModel = '';
  let isLoading = false;
  let error: string | null = null;
  let testStatus: 'idle' | 'success' | 'error' = 'idle';

  // Prompts state
  let replyPrompt = '';
  let dmPrompt = '';
  let nonConnectedTemplate = '';

  // Static text fields (used when AI is off)
  let staticReplyText = '';
  let staticNonConnectedText = '';
  let staticDmText = '';

  // Other settings
  let temperature = 0.7;
  let topP = 1.0;

  function handleFetchModels(apiKeyToTest: string, currentModel: string | undefined) {
    if (!apiKeyToTest) return;

    isLoading = true;
    models = [];
    error = null;
    testStatus = 'idle';

    // When testing, send the current API key from the input field.
    // The background script will use this for the test fetch without saving it.
    chrome.runtime.sendMessage(
      { type: 'GET_MODELS', payload: { apiKey: apiKeyToTest } },
      (response) => {
        if (response && response.status === 'success') {
          const fetchedModels: OpenRouterModel[] = response.payload;
          models = fetchedModels;
          testStatus = 'success';
          // If the previously selected model is not in the new list, reset it.
          if (!fetchedModels.some((model) => model.id === currentModel)) {
            selectedModel = '';
          }
        } else {
          error = `Failed to fetch models. Ensure your API key is valid. Error: ${response?.message}`;
          testStatus = 'error';
        }
        isLoading = false;
      }
    );
  }

  // Load config on component mount
  onMount(() => {
    chrome.runtime.sendMessage({ type: 'GET_AI_CONFIG' }, (response) => {
      if (response.status === 'success') {
        const config: AIConfig = response.payload;
        apiKey = config.apiKey || '';
        selectedModel = config.model || '';
        temperature = config.temperature || 0.7;
        topP = config.top_p || 1.0;
        replyPrompt = config.reply?.customPrompt || '';
        dmPrompt = config.dm?.customPrompt || '';
        nonConnectedTemplate =
          config.reply?.nonConnectedPrompt ||
          "Thanks for your comment! I'd love to connect first so we can continue the conversation.";
        
        // Load AI enabled state and static texts
        isAiEnabled = config.aiEnabled !== undefined ? config.aiEnabled : true;
        staticReplyText = config.staticTexts?.replyText || '';
        staticNonConnectedText = config.staticTexts?.nonConnectedText || '';
        staticDmText = config.staticTexts?.dmText || '';

        // If an API key is already present, fetch models automatically.
        if (config.apiKey) {
          handleFetchModels(config.apiKey, config.model);
        }
      } else {
        console.error('Failed to load reply settings:', response.message);
        error = `Failed to load reply settings: ${response.message}`;
      }
    });
    
    // Initial animation
    if (containerElement) {
      gsap.fromTo(containerElement,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
      );
    }
    
    // Stagger animate form elements
    if (formElements.length > 0) {
      gsap.fromTo(formElements.filter(Boolean),
        { opacity: 0, x: -20 },
        { 
          opacity: 1, 
          x: 0,
          duration: 0.4, 
          ease: 'power2.out',
          stagger: 0.1 
        }
      );
    }
  });

  function handleSaveConfig() {
    saveMessage = '';
    return new Promise<void>((resolve, reject) => {
      const partialConfig: Partial<AIConfig> = {
        apiKey,
        model: selectedModel,
        temperature,
        top_p: topP,
        reply: {
          customPrompt: replyPrompt,
          nonConnectedPrompt: nonConnectedTemplate,
        },
        dm: {
          customPrompt: dmPrompt,
        },
        // Add static text fields and AI toggle state
        staticTexts: {
          replyText: staticReplyText,
          nonConnectedText: staticNonConnectedText,
          dmText: staticDmText,
        },
        aiEnabled: isAiEnabled,
      };
      chrome.runtime.sendMessage(
        { type: 'UPDATE_AI_CONFIG', payload: partialConfig },
        (response) => {
          if (response && response.status === 'success') {
            console.log('Reply settings saved.');
            saveMessage = 'Settings saved successfully!';
            setTimeout(() => (saveMessage = ''), 3000); // Clear after 3s
            resolve();
          } else {
            const errorMsg = `Failed to save reply settings: ${
              response?.message || 'No response from background script.'
            }`;
            console.error(errorMsg);
            error = errorMsg;
            reject(new Error(errorMsg));
          }
        }
      );
    });
  }

  function onTestClick() {
    handleFetchModels(apiKey, selectedModel);
  }
</script>

<div class="ai-settings-section bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 animate-slide-up" bind:this={containerElement}>
  <div class="sidebar-section-header">
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-2">
        <div class="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-violet-500"></div>
        <h2 class="font-semibold text-gray-900">Reply Settings</h2>
      </div>
      <!-- AI Toggle Button -->
      <div class="flex items-center space-x-2">
        <span class="text-sm text-gray-600">{isAiEnabled ? 'AI' : 'Manual'}</span>
        <button
          type="button"
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 {isAiEnabled ? 'bg-purple-600' : 'bg-gray-200'}"
          on:click={() => isAiEnabled = !isAiEnabled}
          aria-pressed={isAiEnabled}
          aria-label="Toggle AI mode"
        >
          <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {isAiEnabled ? 'translate-x-6' : 'translate-x-1'}"></span>
        </button>
      </div>
    </div>
  </div>

  {#if isAiEnabled}
    <!-- AI Configuration Section -->
    <div class="form-group mb-4" bind:this={formElements[0]}>
      <label for="apiKey" class="block text-sm font-medium text-gray-800 mb-2 uppercase tracking-wide">OpenRouter API Key</label>
      <div class="input-group">
        <input
          type="password"
          id="apiKey"
          name="apiKey"
          placeholder="sk-or-..."
          bind:value={apiKey}
          class="flex-1 px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition-all duration-200 bg-gray-50 hover:bg-white"
        />
        <button on:click={onTestClick} disabled={isLoading || !apiKey} class="px-4 py-2 text-base font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200">
          {isLoading ? 'Testing...' : 'Test'}
        </button>
      </div>
      {#if testStatus === 'success'}
        <p class="success-message">API Key is valid. Models loaded.</p>
      {/if}
      {#if error}
        <p class="error-message">{error}</p>
      {/if}
    </div>
  {:else}
    <!-- Static Text Fields Section -->
    <div class="form-group mb-4">
      <label for="staticReplyText" class="block text-sm font-medium text-gray-800 mb-2 uppercase tracking-wide">Reply Text</label>
      <textarea
        id="staticReplyText"
        name="staticReplyText"
        rows={3}
        bind:value={staticReplyText}
        placeholder="Enter your standard reply text..."
        class="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition-all duration-200 bg-gray-50 hover:bg-white resize-none"
      ></textarea>
      <small class="text-sm text-gray-700 mt-1 block">This text will be used for all replies when AI is disabled.</small>
    </div>

    <div class="form-group mb-4">
      <label for="staticNonConnectedText" class="block text-sm font-medium text-gray-800 mb-2 uppercase tracking-wide">Non-Connected Reply Text</label>
      <textarea
        id="staticNonConnectedText"
        name="staticNonConnectedText"
        rows={3}
        bind:value={staticNonConnectedText}
        placeholder="Enter your reply for non-connected users..."
        class="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition-all duration-200 bg-gray-50 hover:bg-white resize-none"
      ></textarea>
      <small class="text-sm text-gray-700 mt-1 block">Used when the commenter is not a 1st-degree connection.</small>
    </div>

    <div class="form-group mb-4">
      <label for="staticDmText" class="block text-sm font-medium text-gray-800 mb-2 uppercase tracking-wide">DM Text</label>
      <textarea
        id="staticDmText"
        name="staticDmText"
        rows={3}
        bind:value={staticDmText}
        placeholder="Enter your standard DM text..."
        class="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition-all duration-200 bg-gray-50 hover:bg-white resize-none"
      ></textarea>
      <small class="text-sm text-gray-700 mt-1 block">This text will be used for all direct messages when AI is disabled.</small>
    </div>
  {/if}

  {#if isAiEnabled}
    <div class="form-group mb-4" bind:this={formElements[1]}>
      <label for="replyPrompt" class="block text-sm font-medium text-gray-800 mb-2 uppercase tracking-wide">Custom Reply Prompt</label>
      <textarea
        id="replyPrompt"
        name="replyPrompt"
        rows={4}
        bind:value={replyPrompt}
        class="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition-all duration-200 bg-gray-50 hover:bg-white resize-none"
      ></textarea>
    </div>

    <div class="form-group mb-4" bind:this={formElements[2]}>
      <label for="nonConnectedTemplate" class="block text-sm font-medium text-gray-800 mb-2 uppercase tracking-wide">Non-connected Reply Prompt</label>
      <textarea
        id="nonConnectedTemplate"
        name="nonConnectedTemplate"
        rows={3}
        bind:value={nonConnectedTemplate}
        class="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition-all duration-200 bg-gray-50 hover:bg-white resize-none"
      ></textarea>
      <small class="text-sm text-gray-700 mt-1 block">AI prompt used when the commenter is not a 1st-degree connection.</small>
    </div>

    <div class="form-group mb-4" bind:this={formElements[3]}>
      <label for="dmPrompt" class="block text-sm font-medium text-gray-800 mb-2 uppercase tracking-wide">Custom DM Prompt</label>
      <textarea
        id="dmPrompt"
        name="dmPrompt"
        rows={4}
        bind:value={dmPrompt}
        class="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition-all duration-200 bg-gray-50 hover:bg-white resize-none"
      ></textarea>
    </div>

    <!-- AI Model - moved outside Advanced Settings -->
    <div class="form-group mb-4" bind:this={formElements[4]}>
      <label for="model" class="block text-sm font-medium text-gray-800 mb-2 uppercase tracking-wide">AI Model</label>
      <select
        id="model"
        name="model"
        bind:value={selectedModel}
        disabled={isLoading || models.length === 0}
        class="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all duration-200 bg-white"
      >
        <option value="" disabled>
          {isLoading
            ? 'Fetching models...'
            : models.length > 0
            ? 'Select a model...'
            : 'Enter API key and test'}
        </option>
        {#each models as model (model.id)}
          <option value={model.id}>
            {model.name}
          </option>
        {/each}
      </select>
    </div>
  {/if}

  <!-- Advanced Settings - Collapsible (only show when AI is enabled) -->
  {#if isAiEnabled}
    <div class="collapsible-section mb-4">
      <button
        type="button"
        class="collapsible-header w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-all duration-200"
        on:click={() => (isAdvancedExpanded = !isAdvancedExpanded)}
        aria-expanded={isAdvancedExpanded}
      >
        <div class="flex items-center space-x-2">
          <div class="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"></div>
          <h3 class="font-medium text-gray-900">Advanced Settings</h3>
        </div>
        <span class="collapse-icon transform transition-transform duration-200 text-gray-500 {isAdvancedExpanded ? 'rotate-180' : ''}">
          ▼
        </span>
      </button>
    
    {#if isAdvancedExpanded}
      <div class="collapsible-content mt-3 space-y-4 p-3 bg-gray-25 rounded-lg border border-gray-100">

        <div class="form-group">
          <label for="temperature" class="block text-sm font-medium text-gray-800 mb-2 uppercase tracking-wide">
            Temperature: <span class="text-blue-600 font-semibold">{temperature.toFixed(1)}</span>
          </label>
          <input
            type="range"
            id="temperature"
            name="temperature"
            min="0"
            max="1.5"
            step="0.1"
            bind:value={temperature}
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
          />
          <div class="flex justify-between text-sm text-gray-700 mt-1">
            <span>Conservative</span>
            <span>Creative</span>
          </div>
        </div>

        <div class="form-group">
          <label for="topP" class="block text-sm font-medium text-gray-800 mb-2 uppercase tracking-wide">
            Top P: <span class="text-blue-600 font-semibold">{topP.toFixed(1)}</span>
          </label>
          <input
            type="range"
            id="topP"
            name="topP"
            min="0"
            max="1"
            step="0.1"
            bind:value={topP}
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
          />
          <div class="flex justify-between text-sm text-gray-700 mt-1">
            <span>Focused</span>
            <span>Diverse</span>
          </div>
        </div>

        <div class="form-group">
          <label for="maxTokens" class="block text-sm font-medium text-gray-800 mb-2 uppercase tracking-wide">Max Tokens</label>
          <input type="number" id="maxTokens" name="maxTokens" min="1" value="220" class="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all duration-200 bg-white" />
        </div>

        <div class="form-group">
          <label class="flex items-center space-x-3 cursor-pointer">
            <input type="checkbox" name="stream" checked class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2" />
            <span class="text-base font-medium text-gray-900">Stream Tokens</span>
          </label>
          <small class="text-sm text-gray-700 mt-1 block ml-7">Enable real-time token streaming for faster responses</small>
        </div>
      </div>
    {/if}
    </div>
  {/if}

  <div class="mt-6 pt-4 border-t border-gray-200">
    <button 
      class="save-button w-full px-4 py-3 text-base font-semibold text-white bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-sm hover:shadow-md" 
      on:click={handleSaveConfig}
    >
      <div class="flex items-center justify-center space-x-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span>Save Configuration</span>
      </div>
    </button>

    {#if saveMessage}
      <div class="message mt-3 p-3 rounded-lg text-sm font-medium transition-all duration-300 bg-emerald-50 text-emerald-700 border border-emerald-200" data-testid="save-success-msg">
        <div class="flex items-center space-x-2">
          <svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
          <span>{saveMessage}</span>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .ai-settings-section {
    background: white;
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border: 1px solid #f3f4f6;
  }

  .sidebar-section-header {
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #f3f4f6;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .input-group {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .input-group input {
    flex: 1;
  }

  /* Custom slider styling */
  .slider::-webkit-slider-thumb {
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: all 0.2s ease;
  }

  .slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  }

  .slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    cursor: pointer;
    border: none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .slider::-webkit-slider-track {
    height: 8px;
    border-radius: 4px;
    background: #e5e7eb;
  }

  .slider::-moz-range-track {
    height: 8px;
    border-radius: 4px;
    background: #e5e7eb;
    border: none;
  }

  .success-message {
    color: #111827; /* black for readability */
    font-size: 0.75rem; /* smaller text */
    margin-top: 0.5rem;
  }

  .error-message {
    color: #ef4444;
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }

  .collapsible-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 0.75rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    cursor: pointer;
  }

  .collapse-icon {
    transition: transform 0.2s;
  }

  /* removed unused .collapse-icon.expanded rule; rotation handled via .rotate-180 */

  .collapsible-content {
    padding: 1rem;
    border: 1px solid #e5e7eb;
    border-top: none;
    border-radius: 0 0 0.5rem 0.5rem;
    background: #fafafa;
  }

  /* Animation classes */
  .animate-slide-up {
    animation: slideUp 0.6s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .rotate-180 {
    transform: rotate(180deg);
  }

  /* Focus styles for accessibility */
  .slider:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    ring: 2px;
    ring-color: #8b5cf6;
  }

  @media (prefers-reduced-motion: reduce) {
    .animate-slide-up,
    .collapse-icon,
    .slider::-webkit-slider-thumb {
      animation: none;
      transition: none;
    }
  }
</style>
