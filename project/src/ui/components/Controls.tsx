import { AiSettings } from './AiSettings';
import { useStore } from '../store'; // Assuming a Zustand store is set up

const getPostUrnFromCurrentTab = (): string | null => {
  const postUrnRegex = /(urn:li:activity:\d+)/;
  const match = window.location.href.match(postUrnRegex);
  return match && match[1] ? match[1] : null;
};

export const Controls = () => {
  const pipelineStatus = useStore((state) => state.pipelineStatus);

  const handleExportJson = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'REQUEST_POST_STATE_FOR_EXPORT',
      });

      if (response?.status === 'success' && response.payload) {
        const postState = response.payload;
        const postId = postState._meta.postId;
        const jsonString = JSON.stringify(postState, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `linkedin-post-${postId}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        console.error(
          'Failed to export JSON:',
          response?.message || 'Unknown error'
        );
      }
    } catch (error) {
      console.error('Error during JSON export:', error);
    }
  };

  const handleStart = () => {
    const postUrn = getPostUrnFromCurrentTab();
    if (postUrn) {
      chrome.runtime.sendMessage({
        type: 'START_PIPELINE',
        payload: { postUrn },
      });
    } else {
      console.error('Could not determine Post URN from URL.');
    }
  };

  const handleStop = () => {
    chrome.runtime.sendMessage({ type: 'STOP_PIPELINE' });
  };

  const handleResume = () => {
    chrome.runtime.sendMessage({ type: 'RESUME_PIPELINE' });
  };

  return (
    <div className="sidebar-section">
      <h2>Controls</h2>
      <div className="pipeline-controls">
        {pipelineStatus === 'idle' && (
          <button onClick={handleStart} data-testid="start-button">
            Start
          </button>
        )}
        {pipelineStatus === 'running' && (
          <button onClick={handleStop} data-testid="stop-button">
            Stop
          </button>
        )}
        {pipelineStatus === 'paused' && (
          <button onClick={handleResume} data-testid="resume-button">
            Resume
          </button>
        )}
        {pipelineStatus === 'error' && (
          <button onClick={handleStart} disabled data-testid="error-button">
            Error
          </button>
        )}
      </div>
      <button onClick={handleExportJson}>Export JSON</button>
      <AiSettings />
    </div>
  );
};