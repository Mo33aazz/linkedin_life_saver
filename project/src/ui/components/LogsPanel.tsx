
import { useState, useEffect, useRef } from 'preact/hooks';
import { useStore } from '../store';
import { LogEntry, LogLevel } from '../../shared/types';

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
    <div className={`log-entry ${getLogLevelClass(log.level)}`}>
      <span className="log-timestamp">{new Date(log.timestamp).toLocaleTimeString()}</span>
      <span className="log-level">{log.level}</span>
      <span className="log-message">{log.message}</span>
    </div>
  );
};

export const LogsPanel = () => {
  const logs = useStore(state => state.logs);
  const [activeFilters, setActiveFilters] = useState<Set<LogLevel>>(new Set(['INFO', 'WARN', 'ERROR']));
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

  const filteredLogs = logs.filter(log => activeFilters.has(log.level));

  useEffect(() => {
    if (logContainerRef.current) {
      // Simple auto-scroll to bottom
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [filteredLogs.length]); // Auto-scroll when new filtered logs are added

  return (
    <div className="sidebar-section">
      <div className="section-header">
        <h2>Logs</h2>
        <LogLevelFilter activeFilters={activeFilters} onToggle={toggleFilter} />
      </div>
      <div className="log-container" ref={logContainerRef}>
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log, index) => (
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