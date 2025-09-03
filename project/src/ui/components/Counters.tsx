import { h } from 'preact';
import { useStore } from '../store';
import { Skeleton } from './Skeleton';
import { useAnimatedCounter } from '../hooks/useAnimatedCounter';

const CountersSkeleton = () => (
  <div className="sidebar-section">
    <h2>Live Counters</h2>
    <div className="counter-grid">
      <div className="counter-item">
        <Skeleton className="skeleton-value" />
        <Skeleton className="skeleton-label" />
      </div>
      <div className="counter-item">
        <Skeleton className="skeleton-value" />
        <Skeleton className="skeleton-label" />
      </div>
    </div>
  </div>
);

export const Counters = () => {
  const stats = useStore((state) => state.stats);
  const isInitializing = useStore((state) => state.isInitializing);

  // Use the hook for each value
  const totalAnimated = useAnimatedCounter(stats.totalTopLevelNoReplies);
  const userAnimated = useAnimatedCounter(stats.userTopLevelNoReplies);

  if (isInitializing) {
    return <CountersSkeleton />;
  }

  return (
    <div className="sidebar-section">
      <h2>Live Counters</h2>
      <div className="counter-grid">
        <div className="counter-item">
          <span className="counter-value">{totalAnimated}</span>
          <span className="counter-label">Total Top-Level (No Replies)</span>
        </div>
        <div className="counter-item">
          <span className="counter-value">{userAnimated}</span>
          <span className="counter-label">Your Top-Level (No Replies)</span>
        </div>
      </div>
    </div>
  );
};