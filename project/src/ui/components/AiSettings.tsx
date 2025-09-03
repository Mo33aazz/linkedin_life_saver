import { h } from 'preact';
import { useState } from 'preact/hooks';
import { OpenRouterModel, AIConfig } from '../../shared/types';

export const AiSettings = () => {
  // AI settings state
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Other settings from original component
  const [temperature, setTemperature] = useState(0.5);
  const [topP, setTopP] = useState(1.0);

  // TODO: In a future task, load the initial config from storage when the component mounts.

  const handleSaveConfig = async () => {
    const partialConfig: Partial<AIConfig> = { apiKey };
    chrome.runtime.sendMessage(
      { type: 'UPDATE_AI_CONFIG', payload: partialConfig },
      (response) => {
        if (response.status === 'success') {
          console.log('API Key saved.');
          // Optionally, provide user feedback like a toast message.
        } else {
          console.error('Failed to save API key:', response.message);
          setError(`Failed to save API key: ${response.message}`);
        }
      }
    );
  };

  const handleFetchModels = async () => {
    setIsLoading(true);
    setModels([]);
    setError(null);
    setTestStatus('idle');

    // 1. Persist the entered API key. The service worker needs the latest key.
    const partialConfig: Partial<AIConfig> = { apiKey };
    const saveResponse = await new Promise<{ status: string; message?: string }>(
      (resolve) => {
        chrome.runtime.sendMessage(
          { type: 'UPDATE_AI_CONFIG', payload: partialConfig },
          (res) => resolve(res || { status: 'error', message: 'No response from background script.' })
        );
      }
    );

    if (saveResponse.status !== 'success') {
      setError(`Failed to save API key before testing: ${saveResponse.message}`);
      setIsLoading(false);
      setTestStatus('error');
      return;
    }

    // 2. After the key is saved, request the models.
    chrome.runtime.sendMessage({ type: 'GET_MODELS' }, (response) => {
      if (response.status === 'success') {
        setModels(response.payload);
        setTestStatus('success');
      } else {
        setError(response.message);
        setTestStatus('error');
      }
      setIsLoading(false);
    });
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
          <button onClick={handleSaveConfig}>Save</button>
          <button onClick={handleFetchModels} disabled={isLoading}>
            {isLoading ? 'Testing...' : 'Test'}
          </button>
        </div>
        {testStatus === 'success' && (
          <p className="success-message">API Key is valid. Models loaded.</p>
        )}
        {error && <p className="error-message">{error}</p>}
      </div>

      <div className="form-group">
        <label htmlFor="model">Model</label>
        <select id="model" name="model" disabled={isLoading || models.length === 0}>
          <option disabled selected>
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
        <label htmlFor="replyPrompt">Custom Reply Prompt</label>
        <textarea id="replyPrompt" name="replyPrompt" rows={4} />
      </div>

      <div className="form-group">
        <label htmlFor="dmPrompt">Custom DM Prompt</label>
        <textarea id="dmPrompt" name="dmPrompt" rows={4} />
      </div>

      <div className="form-group">
        <label htmlFor="temperature">
          Temperature: <span>{temperature}</span>
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
          Top P: <span>{topP}</span>
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
  );
};