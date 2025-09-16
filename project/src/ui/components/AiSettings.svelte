<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import type { OpenRouterModel, AIConfig } from '../../shared/types';
  import { MessageSquare, Eye, EyeOff, Check, X, Save, Loader2 } from 'lucide-svelte';

  let containerElement: HTMLElement;
  let formElements: HTMLElement[] = [];

  // UI state
  let saveMessage = '';
  let isAdvancedExpanded = false;
  let isAiEnabled = true; // Toggle for AI on/off
  let showApiKey = false; // Toggle for API key visibility

  // AI settings state
  let apiKey = '';
  let models: OpenRouterModel[] = [];
  let selectedModel = '';
  let isLoading = false;
  let error: string | null = null;
  let testStatus: 'idle' | 'success' | 'error' = 'idle';

  // Prompts state
  let replyPrompt = 'Please provide a helpful and professional response to this message.';
  let dmPrompt = 'Respond to this direct message in a friendly and personal tone.';
  let nonConnectedTemplate = 'Thank you for reaching out. I\'ll get back to you soon.';

  // Static text fields (used when AI is off)
  let staticReplyText = 'Thank you for your message. I\'ll respond as soon as possible.';
  let staticNonConnectedText = 'Thank you for reaching out. I\'ll review your message and respond soon.';
  let staticDmText = 'Thanks for the direct message! I\'ll get back to you shortly.';

  // Advanced settings
  let temperature = 0.7;
  let topP = 0.9;
  let maxTokens = 150;

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
        topP = config.top_p || 0.9;
        maxTokens = config.maxTokens || 150;
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
        maxTokens,
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

<div class="ai-settings-container bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 animate-slide-up" bind:this={containerElement}>
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2 min-w-0">
      <MessageSquare class="h-5 w-5 text-blue-600" aria-hidden="true" />
      <h2 class="font-semibold text-gray-900 truncate">Auto-Reply Settings</h2>
    </div>
  </div>

  <!-- Mode Toggle -->
  <div class="flex items-center justify-between mb-4">
    <div class="space-y-2">
      <div class="text-sm font-semibold text-gray-900">Reply Mode</div>
      <p class="text-sm text-gray-500">Choose between AI-powered or manual replies</p>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-xs text-gray-500">{isAiEnabled ? 'AI' : 'Manual'}</span>
      <button
        type="button"
        class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 {isAiEnabled ? 'bg-blue-600' : 'bg-gray-300'}"
        on:click={() => isAiEnabled = !isAiEnabled}
        aria-pressed={isAiEnabled}
        aria-label="Toggle AI mode"
      >
        <span class="inline-block h-3 w-3 transform rounded-full bg-white transition-transform {isAiEnabled ? 'translate-x-5' : 'translate-x-1'}"></span>
      </button>
    </div>
  </div>

  <div class="border-t border-gray-100 my-3"></div>

  {#if isAiEnabled}
    <!-- AI Mode Settings -->
    <div class="space-y-4">
      <!-- API Key Section -->
      <div class="space-y-2" bind:this={formElements[0]}>
        <label for="apiKey" class="text-sm font-medium text-gray-900">OpenRouter API Key</label>
        <div class="flex gap-2">
          <div class="flex-1 relative">
            <input
              id="apiKey"
              type={showApiKey ? 'text' : 'password'}
              placeholder="sk-or-..."
              bind:value={apiKey}
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
            />
            <button
              type="button"
              on:click={() => showApiKey = !showApiKey}
              class="absolute inset-y-0 right-0 pr-3 flex items-center hover:text-gray-600 transition-colors"
              aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
            >
              {#if showApiKey}
                <Eye class="h-4 w-4 text-gray-400" aria-hidden="true" />
              {:else}
                <EyeOff class="h-4 w-4 text-gray-400" aria-hidden="true" />
              {/if}
            </button>
          </div>
          <button
            on:click={onTestClick}
            disabled={!apiKey.trim() || isLoading}
            class="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {#if isLoading}
              <Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
            {:else}
              Test
            {/if}
          </button>
        </div>

        {#if testStatus === 'success'}
          <div class="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
            <Check class="h-4 w-4 text-green-600" aria-hidden="true" />
            <span class="text-xs text-green-800">API key valid! Models loaded.</span>
          </div>
        {/if}

        {#if testStatus === 'error'}
          <div class="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
            <X class="h-4 w-4 text-red-600" aria-hidden="true" />
            <span class="text-xs text-red-800">{error || 'Invalid API key. Please check and try again.'}</span>
          </div>
        {/if}
      </div>

      <!-- Model Selection -->
      {#if models.length > 0}
        <div class="space-y-2">
          <label for="model" class="text-sm font-medium text-gray-900">AI Model</label>
          <select
            id="model"
            bind:value={selectedModel}
            disabled={isLoading || models.length === 0}
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 hover:bg-white transition-all duration-200"
          >
            <option value="" disabled>Select an AI model</option>
            {#each models as model (model.id)}
              <option value={model.id}>{model.name}</option>
            {/each}
          </select>
        </div>
      {/if}

      <!-- AI Prompts -->
      <div class="space-y-3">
        <div class="text-sm font-semibold text-gray-900">AI Prompts</div>

        <div class="space-y-3">
          <div>
            <label for="generalPrompt" class="text-sm font-medium text-gray-700 mb-3 block">General Replies</label>
            <textarea
              id="generalPrompt"
              placeholder="Prompt for general message replies"
              bind:value={replyPrompt}
              rows="2"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 hover:bg-white transition-all duration-200 resize-none"
            ></textarea>
          </div>

          <div>
            <label for="dmPrompt" class="text-sm font-medium text-gray-700 mb-3 block">Direct Messages</label>
            <textarea
              id="dmPrompt"
              placeholder="Prompt for direct message replies"
              bind:value={dmPrompt}
              rows="2"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 hover:bg-white transition-all duration-200 resize-none"
            ></textarea>
          </div>

          <div>
            <label for="nonConnectedPrompt" class="text-sm font-medium text-gray-700 mb-3 block">Non-Connected Users</label>
            <textarea
              id="nonConnectedPrompt"
              placeholder="Prompt for replies to non-connected users"
              bind:value={nonConnectedTemplate}
              rows="2"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 hover:bg-white transition-all duration-200 resize-none"
            ></textarea>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <!-- Manual Mode Settings -->
    <div class="space-y-4">
      <div class="text-lg font-medium text-gray-900">Manual Reply Templates</div>

      <div class="space-y-3">
        <div>
          <label for="generalReply" class="text-sm font-medium text-gray-700 mb-3 block">General Replies</label>
          <textarea
            id="generalReply"
            placeholder="Enter your standard reply message"
            bind:value={staticReplyText}
            rows="2"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 hover:bg-white transition-all duration-200 resize-none"
          ></textarea>
        </div>

        <div>
          <label for="dmReply" class="text-sm font-medium text-gray-700 mb-3 block">Direct Messages</label>
          <textarea
            id="dmReply"
            placeholder="Enter your direct message reply"
            bind:value={staticDmText}
            rows="2"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 hover:bg-white transition-all duration-200 resize-none"
          ></textarea>
        </div>

        <div>
          <label for="nonConnectedReply" class="text-sm font-medium text-gray-700 mb-3 block">Non-Connected Users</label>
          <textarea
            id="nonConnectedReply"
            placeholder="Enter reply for non-connected users"
            bind:value={staticNonConnectedText}
            rows="2"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 hover:bg-white transition-all duration-200 resize-none"
          ></textarea>
        </div>
      </div>
    </div>
  {/if}

  <!-- Advanced Settings (only show when AI is enabled) -->
  {#if isAiEnabled}
    <div class="border-t border-gray-100 pt-4">
      <button
        type="button"
        class="w-full flex items-center justify-between p-0 bg-transparent border-0 text-left focus:outline-none hover:text-blue-600 transition-colors"
        on:click={() => (isAdvancedExpanded = !isAdvancedExpanded)}
        aria-expanded={isAdvancedExpanded}
      >
        <div class="text-sm font-medium flex items-center gap-2 text-gray-900">
          <svg class="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"></path>
          </svg>
          Advanced Settings
        </div>
        <svg
          class="h-4 w-4 text-gray-400 transition-transform duration-200 {isAdvancedExpanded ? 'rotate-180' : ''}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>

      {#if isAdvancedExpanded}
        <div class="space-y-3 mt-3">
          <!-- Temperature -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <div class="text-xs font-medium text-gray-900">Temperature</div>
              <span class="text-xs bg-blue-100 px-2 py-0.5 rounded-full font-medium text-blue-800">{temperature.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              bind:value={temperature}
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <p class="text-xs text-gray-500 mt-1">Controls randomness (0 = focused, 2 = creative)</p>
          </div>

          <!-- Top P -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <div class="text-xs font-medium text-gray-900">Top P</div>
              <span class="text-xs bg-blue-100 px-2 py-0.5 rounded-full font-medium text-blue-800">{topP.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              bind:value={topP}
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <p class="text-xs text-gray-500 mt-1">Controls word choice diversity</p>
          </div>

          <!-- Max Tokens -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <div class="text-xs font-medium text-gray-900">Max Tokens</div>
              <span class="text-xs bg-blue-100 px-2 py-0.5 rounded-full font-medium text-blue-800">{maxTokens}</span>
            </div>
            <input
              type="range"
              min="50"
              max="500"
              step="10"
              bind:value={maxTokens}
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <p class="text-xs text-gray-500 mt-1">Maximum response length</p>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <div class="border-t border-gray-100 pt-3 mt-4">
    <button
      on:click={handleSaveConfig}
      class="w-full px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      <div class="flex items-center justify-center gap-2">
        <Save class="w-4 h-4" aria-hidden="true" />
        <span>Save Configuration</span>
      </div>
    </button>

    {#if saveMessage}
      <div class="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
        <div class="flex items-center gap-2">
          <Check class="w-4 h-4 text-green-600" aria-hidden="true" />
          <span class="text-xs text-green-800">{saveMessage}</span>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .ai-settings-container {
    backdrop-filter: blur(10px);
    border: 1px solid rgba(229, 231, 235, 0.3);
  }

  .ai-settings-container:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  /* Custom range slider styling */
  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }

  input[type="range"]::-webkit-slider-track {
    height: 6px;
    border-radius: 3px;
    background: #e5e7eb;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: all 0.2s ease;
    border: 2px solid white;
  }

  input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }

  input[type="range"]::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  input[type="range"]::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: #e5e7eb;
    border: none;
  }

  input[type="range"]:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  /* Animation for initial load */
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

  .animate-slide-up {
    animation: slideUp 0.6s ease-out;
  }

  /* Accessibility and reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .animate-slide-up,
    .ai-settings-container:hover,
    input[type="range"]::-webkit-slider-thumb {
      animation: none;
      transition: none;
      transform: none;
    }
  }

  /* Focus styles */
  button:focus,
  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
  }

  /* Responsive adjustments */
  @media (max-width: 640px) {
    .ai-settings-container {
      padding: 0.75rem;
      margin-bottom: 0.75rem;
    }
  }
</style>
