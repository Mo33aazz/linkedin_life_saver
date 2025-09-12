import { pipelineStatus } from '../store';
import { RunState } from '../../shared/types';
import { useState, useEffect } from 'preact/hooks';
import { get } from 'svelte/store';

export const Header = () => {
  // Subscribe to only the pipeline status
  const [currentPipelineStatus, setCurrentPipelineStatus] = useState(get(pipelineStatus));

  useEffect(() => {
    const unsubscribe = pipelineStatus.subscribe(setCurrentPipelineStatus);
    return () => unsubscribe();
  }, []);

  const getStatusIndicatorClass = (status: RunState) => {
    switch (status) {
      case 'running':
        return 'bg-green-500 animate-pulse';
      case 'paused':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      case 'idle':
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg shadow-sm mb-4">
      {/* Status Panel */}
      <div className="p-2 bg-white dark:bg-gray-700 rounded-md" data-testid="status-panel">
        <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Status</h3>
        <div className="flex items-center">
          <span className={`w-2.5 h-2.5 rounded-full mr-2 ${getStatusIndicatorClass(currentPipelineStatus)}`} />
          <span className="text-xs capitalize text-gray-700 dark:text-gray-200">{currentPipelineStatus}</span>
        </div>
      </div>
    </div>
  );
};