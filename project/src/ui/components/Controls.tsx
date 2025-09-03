import { h } from 'preact';
import { AiSettings } from './AiSettings';

export const Controls = () => {
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
        // Optionally, show an error to the user in the UI
      }
    } catch (error) {
      console.error('Error during JSON export:', error);
    }
  };

  return (
    <div className="sidebar-section">
      <h2>Controls</h2>
      <button onClick={handleExportJson}>Export JSON</button>
      <AiSettings />
      {/* Other controls will go here */}
    </div>
  );
};