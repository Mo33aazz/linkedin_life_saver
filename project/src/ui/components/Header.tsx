import { useStore } from '../store';
import { RunState } from '../../shared/types';

export const Header = () => {
  // Subscribe to only the exact pieces needed to avoid unnecessary re-renders
  const pipelineStatus = useStore((state) => state.pipelineStatus);
  const postUrn = useStore((state) => state.postUrn);
  const aiConfig = useStore((state) => state.aiConfig);
  const userProfileUrl = useStore((state) => state.userProfileUrl);
  const postAuthor = useStore((state) => state.postAuthor);
  const postTimestamp = useStore((state) => state.postTimestamp);

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

  const postUrl = postUrn ? `https://www.linkedin.com/feed/update/${postUrn}/` : '#';

  return (
    <div className="grid grid-cols-2 gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg shadow-sm mb-4">
      {/* Status Panel */}
      <div className="p-2 bg-white dark:bg-gray-700 rounded-md">
        <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Status</h3>
        <div className="flex items-center">
          <span className={`w-2.5 h-2.5 rounded-full mr-2 ${getStatusIndicatorClass(pipelineStatus)}`} />
          <span className="text-xs capitalize text-gray-700 dark:text-gray-200">{pipelineStatus}</span>
        </div>
      </div>

      {/* Configuration Info Panel */}
      <div className="p-2 bg-white dark:bg-gray-700 rounded-md">
        <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Config</h3>
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
          <div>Max Replies: <span className="font-medium text-gray-700 dark:text-gray-300">{aiConfig?.maxReplies ?? 'N/A'}</span></div>
          <div>Delay: <span className="font-medium text-gray-700 dark:text-gray-300">{aiConfig ? `${aiConfig.minDelay ?? '?'}ms - ${aiConfig.maxDelay ?? '?'}ms` : 'N/A'}</span></div>
        </div>
      </div>

      {/* User Info Panel */}
      <div className="p-2 bg-white dark:bg-gray-700 rounded-md">
        <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Current User</h3>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {userProfileUrl ? (
            <a href={userProfileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 dark:text-blue-400 hover:underline">
              {userProfileUrl}
            </a>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">Not available</span>
          )}
        </div>
      </div>

      {/* Post Info Panel */}
      <div className="p-2 bg-white dark:bg-gray-700 rounded-md">
        <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Target Post</h3>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {postUrn ? (
            <a href={postUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 dark:text-blue-400 hover:underline">
              {postUrn}
            </a>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">N/A</span>
          )}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-0.5">
          <div>Author: <span className="font-medium text-gray-700 dark:text-gray-300">{postAuthor ?? 'N/A'}</span></div>
          <div>Timestamp: <span className="font-medium text-gray-700 dark:text-gray-300">{postTimestamp ?? 'N/A'}</span></div>
        </div>
      </div>
    </div>
  );
};
