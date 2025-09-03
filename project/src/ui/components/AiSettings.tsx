import { h } from 'preact';
import { useState } from 'preact/hooks';

export const AiSettings = () => {
  const [temperature, setTemperature] = useState(0.5);
  const [topP, setTopP] = useState(1.0);

  return (
    <div className="ai-settings-section sidebar-section">
      <h2>AI Settings</h2>

      <div className="form-group">
        <label htmlFor="apiKey">OpenRouter API Key</label>
        <div className="input-group">
          <input type="password" id="apiKey" name="apiKey" placeholder="sk-or-..." />
          <button>Save</button>
          <button>Test</button>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="model">Model</label>
        <select id="model" name="model">
          <option disabled selected>Select a model...</option>
          {/* Models will be populated dynamically */}
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
        <label htmlFor="temperature">Temperature: <span>{temperature}</span></label>
        <input
          type="range"
          id="temperature"
          name="temperature"
          min="0"
          max="1.5"
          step="0.1"
          value={temperature}
          onInput={(e) => setTemperature(parseFloat((e.target as HTMLInputElement).value))}
        />
      </div>

      <div className="form-group">
        <label htmlFor="topP">Top P: <span>{topP}</span></label>
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