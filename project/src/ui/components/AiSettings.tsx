import { useState, useEffect, useCallback } from 'preact/hooks';
import { OpenRouterModel, AIConfig } from '../../shared/types';

export const AiSettings = () => {
  // UI state
  const [saveMessage, setSaveMessage] = useState('');
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);

  // AI settings state
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>(
    'idle'
  );

  // Prompts state
  const [replyPrompt, setReplyPrompt] = useState('');
  const [dmPrompt, setDmPrompt] = useState('');
  const [nonConnectedTemplate, setNonConnectedTemplate] = useState('');

  // Other settings
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(1.0);

  const handleFetchModels = useCallback(
    (apiKeyToTest: string, currentModel: string | undefined) => {
      if (!apiKeyToTest) return;

      setIsLoading(true);
      setModels([]);
      setError(null);
      setTestStatus('idle');

      // When testing, send the current API key from the input field.
      // The background script will use this for the test fetch without saving it.
      chrome.runtime.sendMessage(
        { type: 'GET_MODELS', payload: { apiKey: apiKeyToTest } },
        (response) => {
          if (response && response.status === 'success') {
            const fetchedModels: OpenRouterModel[] = response.payload;
            setModels(fetchedModels);
            setTestStatus('success');
            // If the previously selected model is not in the new list, reset it.
            if (!fetchedModels.some((model) => model.id === currentModel)) {
              setSelectedModel('');
            }
          } else {
            setError(
              `Failed to fetch models. Ensure your API key is valid. Error: ${response?.message}`
            );
            setTestStatus('error');
          }
          setIsLoading(false);
        }
      );
    },
    []
  ); // This function has no dependencies on component state, so it can be memoized.

  // Load config on component mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_AI_CONFIG' }, (response) => {
      if (response.status === 'success') {
        const config: AIConfig = response.payload;
        setApiKey(config.apiKey || '');
        setSelectedModel(config.model || '');
        setTemperature(config.temperature || 0.7);
        setTopP(config.top_p || 1.0);
        setReplyPrompt(config.reply?.customPrompt || '');
        setDmPrompt(config.dm?.customPrompt || '');
        setNonConnectedTemplate(
          config.reply?.nonConnectedTemplate ||
            "Thanks for your comment! I'd love to connect first so we can continue the conversation."
        );

        // If an API key is already present, fetch models automatically.
        if (config.apiKey) {
          handleFetchModels(config.apiKey, config.model);
        }
      } else {
        console.error('Failed to load AI config:', response.message);
        setError(`Failed to load AI config: ${response.message}`);
      }
    });
  }, [handleFetchModels]);

  const handleSaveConfig = () => {
    setSaveMessage('');
    return new Promise<void>((resolve, reject) => {
      const partialConfig: Partial<AIConfig> = {
        apiKey,
        model: selectedModel,
        temperature,
        top_p: topP,
        reply: {
          customPrompt: replyPrompt,
          nonConnectedTemplate,
        },
        dm: {
          customPrompt: dmPrompt,
        },
      };
      chrome.runtime.sendMessage(
        { type: 'UPDATE_AI_CONFIG', payload: partialConfig },
        (response) => {
          if (response && response.status === 'success') {
            console.log('AI Config saved.');
            setSaveMessage('Settings saved successfully!');
            setTimeout(() => setSaveMessage(''), 3000); // Clear after 3s
            resolve();
          } else {
            const errorMsg = `Failed to save AI config: ${
              response?.message || 'No response from background script.'
            }`;
            console.error(errorMsg);
            setError(errorMsg);
            reject(new Error(errorMsg));
          }
        }
      );
    });
  };

  const onTestClick = () => {
    handleFetchModels(apiKey, selectedModel);
  };

  return (
    <div className="ai-settings-section sidebar-section">
      <h2>AI Settings</h2>

      <div className="form-group">
        <label htmlFor="apiKey">OpenRouter API Key</label>
        <div className="input-group">
          <input
            type="password"
            id="apiKey"
            name="apiKey"
            placeholder="sk-or-..."
            value={apiKey}
            onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
          />
          <button onClick={onTestClick} disabled={isLoading || !apiKey}>
            {isLoading ? 'Testing...' : 'Test'}
          </button>
        </div>
        {testStatus === 'success' && (
          <p className="success-message">API Key is valid. Models loaded.</p>
        )}
        {error && <p className="error-message">{error}</p>}
      </div>

      <div className="form-group">
        <label htmlFor="replyPrompt">Custom Reply Prompt</label>
        <textarea
          id="replyPrompt"
          name="replyPrompt"
          rows={4}
          value={replyPrompt}
          onInput={(e) =>
            setReplyPrompt((e.target as HTMLTextAreaElement).value)
          }
        />
      </div>

      <div className="form-group">
        <label htmlFor="nonConnectedTemplate">Non-connected Reply Text</label>
        <textarea
          id="nonConnectedTemplate"
          name="nonConnectedTemplate"
          rows={3}
          value={nonConnectedTemplate}
          onInput={(e) =>
            setNonConnectedTemplate((e.target as HTMLTextAreaElement).value)
          }
        />
        <small>Used when the commenter is not a 1st-degree connection. Sent as-is.</small>
      </div>

      <div className="form-group">
        <label htmlFor="dmPrompt">Custom DM Prompt</label>
        <textarea
          id="dmPrompt"
          name="dmPrompt"
          rows={4}
          value={dmPrompt}
          onInput={(e) => setDmPrompt((e.target as HTMLTextAreaElement).value)}
        />
      </div>

      {/* Advanced Settings - Collapsible */}
      <div className="collapsible-section">
        <button
          type="button"
          className="collapsible-header"
          onClick={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
        >
          <span>Advanced Settings</span>
          <span className={`collapse-icon ${isAdvancedExpanded ? 'expanded' : ''}`}>
            ▼
          </span>
        </button>
        
        {isAdvancedExpanded && (
          <div className="collapsible-content">
            <div className="form-group">
              <label htmlFor="model">Model</label>
              <select
                id="model"
                name="model"
                value={selectedModel}
                onChange={(e) =>
                  setSelectedModel((e.target as HTMLSelectElement).value)
                }
                disabled={isLoading || models.length === 0}
              >
                <option value="" disabled>
                  {isLoading
                    ? 'Fetching models...'
                    : models.length > 0
                    ? 'Select a model...'
                    : 'Enter API key and test'}
                </option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="temperature">
                Temperature: <span>{temperature.toFixed(1)}</span>
              </label>
              <input
                type="range"
                id="temperature"
                name="temperature"
                min="0"
                max="1.5"
                step="0.1"
                value={temperature}
                onInput={(e) =>
                  setTemperature(parseFloat((e.target as HTMLInputElement).value))
                }
              />
            </div>

            <div className="form-group">
              <label htmlFor="topP">
                Top P: <span>{topP.toFixed(1)}</span>
              </label>
              <input
                type="range"
                id="topP"
                name="topP"
                min="0"
                max="1"
                step="0.1"
                value={topP}
                onInput={(e) => setTopP(parseFloat((e.target as HTMLInputElement).value))}
              />
            </div>

            <div className="form-group">
              <label htmlFor="maxTokens">Max Tokens</label>
              <input type="number" id="maxTokens" name="maxTokens" min="1" value="220" />
            </div>

            <div className="form-group">
              <label>
                <input type="checkbox" name="stream" checked />
                Stream Tokens
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="form-group">
        <button onClick={handleSaveConfig} className="save-button">
          Save Settings
        </button>
        {saveMessage && (
          <p className="success-message" data-testid="save-success-msg">
            {saveMessage}
          </p>
        )}
      </div>
    </div>
  );
};
