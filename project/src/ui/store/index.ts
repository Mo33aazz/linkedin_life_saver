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
  userProfileUrl: undefined,
  postAuthor: undefined,
  postTimestamp: undefined,
  aiConfig: undefined,
  updateState: (newState) => set((state) => ({ ...state, ...newState })),
  addLog: (newLog) => set(state => ({
    logs: [...state.logs, newLog].slice(-500) // Cap at 500 logs for performance
  })),
}));


// Expose a helper for E2E tests to simulate messages from the background script.
// This avoids the complexity of trying to mock chrome.runtime.onMessage events.
// NOTE: This test-only helper is exposed when not in a production build.
if (import.meta.env.MODE !== 'production') {
  // The content script runs in an isolated world, so we can't directly
  // call a function on `window` from the test's `page.evaluate`.
  // Instead, we use `postMessage` to bridge the gap. The test will post a
  // message to the main window, and this listener (in the content script's
  // world) will pick it up and dispatch the action to the store.
  window.addEventListener('message', (event) => {
    // We only accept messages from ourselves and with a specific source identifier.
    if (event.source !== window || event.data.source !== '__E2E_TEST__') {
      return;
    }

    const message = event.data;
    if (message.type === 'STATE_UPDATE') {
      console.log('E2E Test: Dispatching STATE_UPDATE message via postMessage:', message.payload);
      useStore.getState().updateState(message.payload as Partial<UIState>);
    } else if (message.type === 'LOG_ENTRY') {
      console.log('E2E Test: Dispatching LOG_ENTRY message via postMessage:', message.payload);
      useStore.getState().addLog(message.payload as LogEntry);
    }
  });
}