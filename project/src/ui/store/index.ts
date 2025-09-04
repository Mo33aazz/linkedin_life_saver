import { create } from 'zustand';
import { UIState, ExtensionMessage, LogEntry } from '../../shared/types';

// 1. Define the store's interface, including actions.
interface Store extends UIState {
  logs: LogEntry[];
  updateState: (newState: Partial<UIState>) => void;
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
  updateState: (newState) => set((state) => ({ ...state, ...newState })),
}));

// 3. Set up a listener for messages from the service worker.
// This is the bridge between the background script and the UI state.
chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === 'STATE_UPDATE') {
    // When a state update is received, call the store's action.
    useStore.getState().updateState(message.payload as Partial<UIState>);
  } else if (message.type === 'LOG_ENTRY') {
    const newLog = message.payload as LogEntry;
    useStore.setState(state => ({
      logs: [...state.logs, newLog].slice(-500) // Cap at 500 logs for performance
    }));
  }
});

// Expose a helper for E2E tests to simulate messages from the background script.
// This avoids the complexity of trying to mock chrome.runtime.onMessage events.
// NOTE: This test-only helper is exposed when not in a production build.
// This allows Playwright to simulate messages from the service worker.
if (import.meta.env.MODE !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__E2E_TEST_DISPATCH_MESSAGE__ = (message: ExtensionMessage) => {
    if (message.type === 'STATE_UPDATE') {
      useStore.getState().updateState(message.payload as Partial<UIState>);
    } else if (message.type === 'LOG_ENTRY') {
      const newLog = message.payload as LogEntry;
      useStore.setState(state => ({
        logs: [...state.logs, newLog].slice(-500)
      }));
    }
  };
}