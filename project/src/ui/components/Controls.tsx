import { useState, useEffect } from 'preact/hooks';
import { useStore } from '../store';
import type { LogEntry } from '../../shared/types';

const getPostUrnFromCurrentTab = (): string | null => {
  const postUrnRegex = /(urn:li:activity:\d+)/;
  const match = window.location.href.match(postUrnRegex);
  return match && match[1] ? match[1] : null;
};


export const Controls = () => {
  // Narrow subscriptions to avoid re-rendering on unrelated state changes
  const pipelineStatus = useStore((state) => state.pipelineStatus);
  const postUrn = useStore((state) => state.postUrn);
  const [maxReplies, setMaxReplies] = useState(10);
  const [delayMin, setDelayMin] = useState(2000);
  const [delayMax, setDelayMax] = useState(5000);
  const [maxOpenTabs, setMaxOpenTabs] = useState(3);
  const [maxScrolls, setMaxScrolls] = useState(10);
  const [rateProfile, setRateProfile] = useState<'normal' | 'conservative' | 'aggressive'>('normal');

  const handleStart = () => {
    chrome.runtime.sendMessage({
      type: 'START_PIPELINE',
      payload: {
        postUrn: getPostUrnFromCurrentTab(),
        // The tabId is now sourced from the message sender object in the background script for robustness.
      }
    });
  };

  const handleStop = () => {
    chrome.runtime.sendMessage({
      type: 'STOP_PIPELINE',
      postUrn,
    });
  };

  const handleResume = () => {
    chrome.runtime.sendMessage({
      type: 'RESUME_PIPELINE',
      postUrn,
    });
  };

  const handleExportJSON = () => {
    chrome.runtime.sendMessage(
      { type: 'EXPORT_JSON', postUrn },
      (response) => {
        if (response?.data) {
          const blob = new Blob([JSON.stringify(response.data, null, 2)], {
            type: 'application/json',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `linkedin-post-${postUrn}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
    );
  };

  const handleExportLogs = () => {
    chrome.runtime.sendMessage(
      { type: 'EXPORT_LOGS' },
      (response) => {
        if (response?.logs) {
          const blob = new Blob(
            [response.logs.map((log: LogEntry) => JSON.stringify(log)).join('\n')],
            { type: 'application/x-ndjson' }
          );
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `linkedin-assistant-logs-${Date.now()}.ndjson`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
    );
  };

  const handleResetSession = () => {
    if (confirm('Are you sure you want to reset the session? This will clear all progress.')) {
      chrome.runtime.sendMessage({
        type: 'RESET_SESSION',
        postUrn,
      });
    }
  };

  useEffect(() => {
    // Send settings updates to background
    chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: {
        maxReplies,
        delayMin,
        delayMax,
        maxOpenTabs,
        maxScrolls,
        rateProfile,
      },
    });
  }, [maxReplies, delayMin, delayMax, maxOpenTabs, maxScrolls, rateProfile]);

  return (
    <div className="sidebar-section controls">
      <h3>Controls</h3>

      <div className="control-buttons">
        {pipelineStatus === 'idle' && (
          <button
            onClick={handleStart}
            className="control-button start-button"
            data-testid="start-button"
            aria-label="Start pipeline"
          >
            Start
          </button>
        )}

        {pipelineStatus === 'running' && (
          <button
            onClick={handleStop}
            className="control-button stop-button"
            data-testid="stop-button"
            aria-label="Stop pipeline"
          >
            Stop
          </button>
        )}

        {pipelineStatus === 'paused' && (
          <button
            onClick={handleResume}
            className="control-button resume-button"
            data-testid="resume-button"
            aria-label="Resume pipeline"
          >
            Resume
          </button>
        )}
      </div>

      <div className="control-inputs">
        <div className="control-group">
          <label htmlFor="max-replies">Max Replies (session):</label>
          <input
            id="max-replies"
            type="number"
            min="1"
            max="100"
            value={maxReplies}
            onChange={(e) => setMaxReplies(parseInt((e.target as HTMLInputElement).value, 10))}
          />
        </div>

        <div className="control-group">
          <label>Delay Between Replies:</label>
          <div className="range-inputs">
            <input
              type="number"
              min="1000"
              max="60000"
              step="1000"
              value={delayMin}
              onChange={(e) => setDelayMin(parseInt((e.target as HTMLInputElement).value, 10))}
              placeholder="Min (ms)"
            />
            <span>-</span>
            <input
              type="number"
              min="1000"
              max="60000"
              step="1000"
              value={delayMax}
              onChange={(e) => setDelayMax(parseInt((e.target as HTMLInputElement).value, 10))}
              placeholder="Max (ms)"
            />
          </div>
        </div>

        <div className="control-group">
          <label htmlFor="max-tabs">Max Open Tabs:</label>
          <input
            id="max-tabs"
            type="number"
            min="1"
            max="10"
            value={maxOpenTabs}
            onChange={(e) => setMaxOpenTabs(parseInt((e.target as HTMLInputElement).value, 10))}
          />
        </div>

        <div className="control-group">
          <label htmlFor="max-scrolls">Max Scrolls:</label>
          <input
            id="max-scrolls"
            type="number"
            min="1"
            max="50"
            value={maxScrolls}
            onChange={(e) => setMaxScrolls(parseInt((e.target as HTMLInputElement).value, 10))}
          />
        </div>

        <div className="control-group">
          <label htmlFor="rate-profile">Rate Limit Profile:</label>
          <select
            id="rate-profile"
            value={rateProfile}
            onChange={(e) => setRateProfile((e.target as HTMLSelectElement).value as 'normal' | 'conservative' | 'aggressive')}
          >
            <option value="normal">Normal</option>
            <option value="conservative">Conservative</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>
      </div>

      <div className="control-actions">
        <button onClick={handleExportJSON} className="action-button" data-testid="export-json-button">
          Export JSON
        </button>
        <button onClick={handleExportLogs} className="action-button" data-testid="export-logs-button">
          Export Logs
        </button>
        <button onClick={handleResetSession} className="action-button danger" data-testid="reset-session-button">
          Reset Session
        </button>
      </div>
    </div>
  );
};
