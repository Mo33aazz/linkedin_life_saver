import { h } from 'preact';
import { Header } from './components/Header';
import { Counters } from './components/Counters';
import { PipelineProgress } from './components/PipelineProgress';
import { Controls } from './components/Controls';
import { LogsPanel } from './components/LogsPanel';

export const App = () => {
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