import { h } from 'preact';
import { useStore } from '../store';

export const Counters = () => {
  // 1. Select the 'stats' object from the store.
  // The component will automatically re-render when this part of the state changes.
  const stats = useStore((state) => state.stats);

  return (
    <div className="sidebar-section">
      <h2>Live Counters</h2>
      <div className="counter-grid">
        <div className="counter-item">
          <span className="counter-value">{stats.totalTopLevelNoReplies}</span>
          <span className="counter-label">Total Top-Level (No Replies)</span>
        </div>
        <div className="counter-item">
          <span className="counter-value">{stats.userTopLevelNoReplies}</span>
          <span className="counter-label">Your Top-Level (No Replies)</span>
        </div>
      </div>
    </div>
  );
};