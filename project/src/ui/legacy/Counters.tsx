import { stats, uiState } from '../store';
import { Skeleton } from './Skeleton';
import { useAnimatedCounter } from '../hooks/useAnimatedCounter';
import { useState, useEffect } from 'preact/hooks';
import { get } from 'svelte/store';

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
  const [currentStats, setCurrentStats] = useState(get(stats));
  const [isInitializing, setIsInitializing] = useState(get(uiState).isInitializing);

  useEffect(() => {
    const unsubscribeStats = stats.subscribe(setCurrentStats);
    const unsubscribeUiState = uiState.subscribe((state) => setIsInitializing(state.isInitializing));
    return () => {
      unsubscribeStats();
      unsubscribeUiState();
    };
  }, []);

  // Use the hook for each value
  const totalAnimated = useAnimatedCounter(currentStats.totalTopLevelNoReplies);
  const userAnimated = useAnimatedCounter(currentStats.userTopLevelNoReplies);

  if (isInitializing) {
    return <CountersSkeleton />;
  }

  return (
    <div className="sidebar-section">
      <h2>Live Counters</h2>
      <div className="counter-grid">
        <div className="counter-item">
          <span className="counter-value" data-testid="total-counter">{totalAnimated}</span>
          <span className="counter-label">Total Top-Level Comments</span>
        </div>
        <div className="counter-item">
          <span className="counter-value" data-testid="user-counter">{userAnimated}</span>
          <span className="counter-label">Without Your Reply</span>
        </div>
      </div>
    </div>
  );
};
