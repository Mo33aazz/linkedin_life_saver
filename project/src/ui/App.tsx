import { useEffect } from 'preact/hooks';
import { Header } from './components/Header';
import { Counters } from './components/Counters';
import { PipelineProgress } from './components/PipelineProgress';
import { Controls } from './components/Controls';
import { LogsPanel } from './components/LogsPanel';
import { AiSettings } from './components/AiSettings';
import { useStore } from './store';
import type { ExtensionMessage, UIState, LogEntry } from '../shared/types';

export const App = () => {
  useEffect(() => {
    console.log('UI App component mounted. Sending ping to service worker.');
    chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
      } else {
        console.log('Received response from service worker:', response);
      }
    });

    const handleMessage = (message: ExtensionMessage) => {
      console.log('UI received message:', message);
      if (message.type === 'STATE_UPDATE' && message.payload) {
        useStore.getState().updateState(message.payload as Partial<UIState>);
        return;
      } else if (message.type === 'LOG_ENTRY' && message.payload) {
        useStore.getState().addLog(message.payload as LogEntry);
        return;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <div id="sidebar-app" className="sidebar-container">
      <h1>LinkedIn Engagement Assistant</h1>
      <Header />
      <Counters />
      <PipelineProgress />
      <Controls />
      <AiSettings />
      <LogsPanel />
    </div>
  );
};