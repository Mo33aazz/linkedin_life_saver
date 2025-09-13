import { useState, useEffect, useRef } from 'preact/hooks';
import { logs } from '../store';
import { LogEntry, LogLevel } from '../../shared/types';
import { get } from 'svelte/store';

const LOG_LEVELS: LogLevel[] = ['INFO', 'WARN', 'ERROR', 'DEBUG'];

type LogLevelFilterProps = {
  activeFilters: Set<LogLevel>;
  onToggle: (level: LogLevel) => void;
};

const LogLevelFilter = ({ activeFilters, onToggle }: LogLevelFilterProps) => {
  return (
    <div className="log-filters">
      {LOG_LEVELS.map(level => (
        <label key={level} className={`log-filter-label log-filter-label--${level.toLowerCase()}`}>
          <input
            type="checkbox"
            checked={activeFilters.has(level)}
            onChange={() => onToggle(level)}
          />
          {level}
        </label>
      ))}
    </div>
  );
};

const LogEntryItem = ({ log }: { log: LogEntry }) => {
  const getLogLevelClass = (level: LogLevel) => {
    return `log-entry--${level.toLowerCase()}`;
  };

  return (
    <div 
      className={`log-entry ${getLogLevelClass(log.level)}`}
      data-testid={`log-entry-${log.timestamp}`}
    >
      <span className="log-timestamp">{new Date(log.timestamp).toLocaleTimeString()}</span>
      <span className="log-level">{log.level}</span>
      <span className="log-message">{log.message}</span>
    </div>
  );
};

export const LogsPanel = () => {
  const [currentLogs, setCurrentLogs] = useState<LogEntry[]>(get(logs));

  useEffect(() => {
    const unsubscribe = logs.subscribe(setCurrentLogs);
    return () => unsubscribe();
  }, []);
  const [activeFilters, setActiveFilters] = useState<Set<LogLevel>>(new Set(['DEBUG', 'INFO', 'WARN', 'ERROR']));
  const logContainerRef = useRef<HTMLDivElement>(null);

  const toggleFilter = (level: LogLevel) => {
    setActiveFilters(prevFilters => {
      const newFilters = new Set(prevFilters);
      if (newFilters.has(level)) {
        newFilters.delete(level);
      } else {
        newFilters.add(level);
      }
      return newFilters;
    });
  };

  // Show newest logs at the top
  const filteredLogs = currentLogs
    .filter((log: LogEntry) => activeFilters.has(log.level))
    .slice(-100)
    .reverse();

  useEffect(() => {
    if (logContainerRef.current) {
      // Keep view pinned to the top since newest are first
      logContainerRef.current.scrollTop = 0;
    }
  }, [filteredLogs.length]); // Adjust scroll when new filtered logs are added

  return (
    <div className="sidebar-section">
      <div className="section-header">
        <h2>Logs</h2>
        <LogLevelFilter activeFilters={activeFilters} onToggle={toggleFilter} />
      </div>
      <div className="log-container" ref={logContainerRef}>
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log: LogEntry, index: number) => (
            // Using index is acceptable here as logs are an append-only list.
            <LogEntryItem key={`${log.timestamp}-${index}`} log={log} />
          ))
        ) : (
          <p className="log-placeholder">No logs to display for the selected levels.</p>
        )}
      </div>
    </div>
  );
};
