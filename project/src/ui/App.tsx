import { useEffect } from 'preact/hooks';
import { Header } from './components/Header';
import { Counters } from './components/Counters';
import { PipelineProgress } from './components/PipelineProgress';
import { Controls } from './components/Controls';
import { LogsPanel } from './components/LogsPanel';

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
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <div className="sidebar-container">
      <h1>LinkedIn Engagement Assistant</h1>
      <Header />
      <Counters />
      <PipelineProgress />
      <Controls />
      <LogsPanel />
    </div>
  );
};