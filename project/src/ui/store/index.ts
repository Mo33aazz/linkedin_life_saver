import { writable, derived } from 'svelte/store';
import type { UIState, LogEntry, RunState, Comment } from '../../shared/types';

// Sample test data to demonstrate timeline functionality
const sampleComments: Comment[] = [
  {
    commentId: 'comment1',
    text: 'Great post! Thanks for sharing this valuable insight.',
    ownerProfileUrl: 'https://www.linkedin.com/in/john-doe/',
    timestamp: '2h',
    type: 'top-level',
    threadId: 'comment1',
    connected: true,
    likeStatus: 'DONE',
    replyStatus: 'DONE',
    dmStatus: 'DONE',
    attempts: { like: 1, reply: 1, dm: 1 },
    lastError: '',
    pipeline: {
      queuedAt: new Date(Date.now() - 3600000).toISOString(),
      likedAt: new Date(Date.now() - 3000000).toISOString(),
      repliedAt: new Date(Date.now() - 2400000).toISOString(),
      dmAt: new Date(Date.now() - 1800000).toISOString(),
      generatedReply: 'Thank you for your feedback!',
    },
  },
  {
    commentId: 'comment2',
    text: 'Interesting perspective on this topic. Would love to hear more.',
    ownerProfileUrl: 'https://www.linkedin.com/in/jane-smith/',
    timestamp: '4h',
    type: 'top-level',
    threadId: 'comment2',
    connected: true,
    likeStatus: 'DONE',
    replyStatus: 'DONE',
    dmStatus: '',
    attempts: { like: 1, reply: 1, dm: 0 },
    lastError: '',
    pipeline: {
      queuedAt: new Date(Date.now() - 7200000).toISOString(),
      likedAt: new Date(Date.now() - 6600000).toISOString(),
      repliedAt: new Date(Date.now() - 6000000).toISOString(),
      dmAt: '',
      generatedReply: 'I appreciate your interest! Let me know if you have any questions.',
    },
  },
  {
    commentId: 'comment3',
    text: 'This is exactly what I was looking for. Amazing work!',
    ownerProfileUrl: 'https://www.linkedin.com/in/mike-johnson/',
    timestamp: '6h',
    type: 'top-level',
    threadId: 'comment3',
    connected: true,
    likeStatus: 'DONE',
    replyStatus: '',
    dmStatus: '',
    attempts: { like: 1, reply: 0, dm: 0 },
    lastError: '',
    pipeline: {
      queuedAt: new Date(Date.now() - 10800000).toISOString(),
      likedAt: new Date(Date.now() - 10200000).toISOString(),
      repliedAt: '',
      dmAt: '',
    },
  },
  {
    commentId: 'comment4',
    text: 'Could you elaborate more on this point?',
    ownerProfileUrl: 'https://www.linkedin.com/in/sarah-wilson/',
    timestamp: '8h',
    type: 'top-level',
    threadId: 'comment4',
    connected: true,
    likeStatus: '',
    replyStatus: '',
    dmStatus: '',
    attempts: { like: 0, reply: 0, dm: 0 },
    lastError: '',
    pipeline: {
      queuedAt: new Date(Date.now() - 14400000).toISOString(),
      likedAt: '',
      repliedAt: '',
      dmAt: '',
    },
  },
];

// Initial state
const initialState: UIState = {
  isInitializing: false, // Set to false to show the timeline immediately
  pipelineStatus: 'running' as RunState,
  stats: {
    totalTopLevelNoReplies: 4,
    userTopLevelNoReplies: 4,
  },
  comments: sampleComments, // Add sample comments to demonstrate timeline
  postUrn: 'urn:li:activity:7368619407989760000',
  userProfileUrl: 'https://www.linkedin.com/in/current-user/',
  postAuthor: 'Demo User',
  postTimestamp: new Date().toISOString(),
  aiConfig: undefined,
};

// Create writable stores
export const uiState = writable<UIState>(initialState);
export const logs = writable<LogEntry[]>([]);

// Derived stores for specific parts of the state
export const pipelineStatus = derived(uiState, ($state) => $state.pipelineStatus);
export const stats = derived(uiState, ($state) => $state.stats);
export const comments = derived(uiState, ($state) => $state.comments);
export const postUrn = derived(uiState, ($state) => $state.postUrn);

// Store actions with proper TypeScript typing
export const uiStore = {
  // Update the entire state or parts of it
  updateState: (newState: Partial<UIState>) => {
    uiState.update(state => ({ ...state, ...newState }));
  },

  // Update pipeline status
  setPipelineStatus: (status: RunState) => {
    uiState.update(state => ({ ...state, pipelineStatus: status }));
  },

  // Update stats
  updateStats: (stats: Partial<UIState['stats']>) => {
    uiState.update(state => ({
      ...state,
      stats: { ...state.stats, ...stats }
    }));
  },

  // Update comments
  updateComments: (comments: UIState['comments']) => {
    uiState.update(state => ({ ...state, comments }));
  },

  // Add a log entry
  addLog: (logEntry: LogEntry) => {
    logs.update(currentLogs => [...currentLogs, logEntry].slice(-100));
  },

  // Clear logs
  clearLogs: () => {
    logs.set([]);
  },

  // Set post URN
  setPostUrn: (urn: string | undefined) => {
    uiState.update(state => ({ ...state, postUrn: urn }));
  },

  // Reset state to initial
  reset: () => {
    uiState.set(initialState);
    logs.set([]);
  },

  // Get current state (for compatibility with existing code)
  getState: () => {
    let currentState: UIState;
    uiState.subscribe(state => currentState = state)();
    return currentState!;
  }
};

// Export individual stores for component use
export { uiState as default };