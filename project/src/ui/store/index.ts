import { create } from 'zustand';
import { UIState, LogEntry } from '../../shared/types';

// 1. Define the store's interface, including actions.
interface Store extends UIState {
  logs: LogEntry[];
  updateState: (newState: Partial<UIState>) => void;
  addLog: (logEntry: LogEntry) => void;
}

// 2. Create the Zustand store with an initial state.
export const useStore = create<Store>((set) => ({
  isInitializing: true,
  pipelineStatus: 'idle',
  stats: {
    totalTopLevelNoReplies: 0,
    userTopLevelNoReplies: 0,
  },
  comments: [],
  logs: [],
  postUrn: undefined,
  updateState: (newState) => set((state) => ({ ...state, ...newState })),
  addLog: (newLog) => set(state => ({
    logs: [...state.logs, newLog].slice(-500) // Cap at 500 logs for performance
  })),
}));


// Expose a helper for E2E tests to simulate messages from the background script.
// This avoids the complexity of trying to mock chrome.runtime.onMessage events.
// NOTE: This test-only helper is exposed when not in a production build.
// This allows Playwright to simulate messages from the service worker.
if (import.meta.env.MODE !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__E2E_TEST_DISPATCH_MESSAGE__ = (message: { type: string, payload: unknown }) => {
    if (message.type === 'STATE_UPDATE') {
      console.log('E2E Test: Dispatching STATE_UPDATE message:', message.payload);
      useStore.setState(message.payload as Partial<UIState>);
    } else if (message.type === 'LOG_ENTRY') {
      console.log('E2E Test: Dispatching LOG_ENTRY message:', message.payload);
      const newLog = message.payload as LogEntry;
      useStore.setState(state => ({
        logs: [...state.logs, newLog].slice(-500)
      }));
    }
  };
}