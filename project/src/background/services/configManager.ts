import { AIConfig } from '../../shared/types';

// 1. Define a constant for the storage key to avoid magic strings.
const AI_CONFIG_KEY = 'aiConfig';

// 2. Define the default configuration object. This serves as the initial state
//    for first-time users. Populate it with sensible defaults based on the
//    aiConfig.schema.json. The apiKey should be empty by default.
const defaultAIConfig: AIConfig = {
  provider: 'openrouter',
  apiKey: '',
  model: 'anthropic/claude-3.5-sonnet',
  temperature: 0.7,
  top_p: 1,
  max_tokens: 256,
  stream: true,
  reply: {
    customPrompt:
      'Keep it warm, brief, specific; acknowledge their point; avoid salesy tone; 0–1 emoji.',
    nonConnectedPrompt:
      "Thanks for your comment! I'd love to connect first so we can continue the conversation.",
  },
  dm: {
    customPrompt:
      'Thank them, reference comment, offer short helpful resource; soft opt-in; no pressure.',
  },
  attribution: {
    httpReferer: 'https://github.com/your-repo/linkedin-engagement-assistant', // Replace with your actual repo/homepage
    xTitle: 'LinkedIn Engagement Assistant',
  },
  modelFilters: {
    onlyTextOutput: true,
    minContext: 8000,
  },
};

// 3. Declare a private, module-level variable to hold the loaded config.
//    Initialize it to null. It will be populated by initializeConfig.
let currentConfig: AIConfig | null = null;

/**
 * Synchronously returns the current AI configuration.
 * Throws an error if the configuration has not been initialized yet.
 */
export const getConfig = (): AIConfig => {
  if (!currentConfig) {
    throw new Error(
      'ConfigManager has not been initialized. Call initializeConfig first.'
    );
  }
  return currentConfig;
};

/**
 * Updates the AI configuration with new values and persists it to chrome.storage.sync.
 * This performs a deep merge for nested configuration objects.
 * @param newConfig A partial AIConfig object with the fields to update.
 */
export const updateConfig = async (
  newConfig: Partial<AIConfig>
): Promise<void> => {
  const existingConfig = getConfig(); // Ensures config is initialized

  // Perform a deep merge for nested objects to handle partial updates gracefully.
  const mergedConfig: AIConfig = {
    ...existingConfig,
    ...newConfig,
    reply: {
      ...existingConfig.reply,
      ...(newConfig.reply || {}),
    },
    dm: {
      ...existingConfig.dm,
      ...(newConfig.dm || {}),
    },
    attribution: {
      ...existingConfig.attribution,
      ...(newConfig.attribution || {}),
    },
    modelFilters: {
      onlyTextOutput:
        newConfig.modelFilters?.onlyTextOutput ??
        existingConfig.modelFilters?.onlyTextOutput ??
        defaultAIConfig.modelFilters!.onlyTextOutput,
      minContext:
        newConfig.modelFilters?.minContext ??
        existingConfig.modelFilters?.minContext ??
        defaultAIConfig.modelFilters!.minContext,
    },
  };

  try {
    await chrome.storage.sync.set({ [AI_CONFIG_KEY]: mergedConfig });
    currentConfig = mergedConfig;
    console.log('AI Config updated and saved:', currentConfig);
  } catch (error) {
    console.error('Failed to save AI config:', error);
  }
};

/**
 * Loads the AI configuration from chrome.storage.sync on startup.
 * If no configuration is found, it saves and loads the default configuration.
 * This function must be called once when the service worker starts.
 */
export const initializeConfig = async (): Promise<void> => {
  try {
    const result = await chrome.storage.sync.get(AI_CONFIG_KEY);
    if (result[AI_CONFIG_KEY]) {
      currentConfig = result[AI_CONFIG_KEY];
      console.log('Loaded AI config from storage:', currentConfig);
    } else {
      console.log(
        'No AI config found in storage. Saving and loading defaults.'
      );
      currentConfig = defaultAIConfig;
      await chrome.storage.sync.set({ [AI_CONFIG_KEY]: defaultAIConfig });
    }
  } catch (error) {
    console.error('Failed to initialize AI config, using defaults:', error);
    currentConfig = defaultAIConfig;
  }
};
