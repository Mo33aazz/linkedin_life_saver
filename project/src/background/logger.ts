import { LogEntry, LogLevel, LogSettings } from '../shared/types';

/**
 * A structured logger that follows the Singleton pattern.
 * It generates structured log objects and broadcasts them to a configured destination.
 */
export class Logger {
  private static instance: Logger;
  private broadcaster: (log: LogEntry) => void = () => {};
  private isInitialized = false;
  private settings: LogSettings = { minLevel: 'INFO' };
  private buffer: LogEntry[] = [];
  private maxBuffer = 1000;

  private levelPriority: Record<LogLevel, number> = {
    DEBUG: 10,
    INFO: 20,
    WARN: 30,
    ERROR: 40,
  };

  // The constructor is private to enforce the Singleton pattern.
  // eslint-disable-next-line no-useless-constructor
  private constructor() {}

  /**
   * Gets the single instance of the Logger.
   * @returns The singleton Logger instance.
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Initializes the logger with a broadcaster function.
   * This should only be called once at the application's entry point.
   * @param broadcaster A function that takes a LogEntry and sends it to the UI.
   */
  public initialize(broadcaster: (log: LogEntry) => void): void {
    if (this.isInitialized) {
      this.warn('Logger is already initialized. Ignoring subsequent calls.');
      return;
    }
    this.broadcaster = broadcaster;
    this.isInitialized = true;
    this.info('Logger initialized.');
  }

  public setSettings(next: Partial<LogSettings>): void {
    this.settings = { ...this.settings, ...next };
    this.debug('Logger settings updated', { settings: this.settings });
  }

  public getSettings(): LogSettings {
    return this.settings;
  }

  public getBufferedLogs(): LogEntry[] {
    return [...this.buffer];
  }

  public setBufferedLogsForTesting(logs: LogEntry[]): void {
    // This method should only be used in non-production environments for testing.
    this.buffer = [...logs];
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    // Respect level filtering
    const minPriority = this.levelPriority[this.settings.minLevel];
    const curPriority = this.levelPriority[level];
    if (curPriority < minPriority) {
      return; // Filter out logs below minLevel
    }

    // Buffer logs for export
    this.buffer.push(logEntry);
    if (this.buffer.length > this.maxBuffer) {
      this.buffer.splice(0, this.buffer.length - this.maxBuffer);
    }

    // Also log to the service worker console for debugging purposes
    const consoleArgs = [
      `[${logEntry.level}] ${logEntry.message}`,
      logEntry.context || '',
    ];
    switch (level) {
      case 'INFO':
        console.info(...consoleArgs);
        break;
      case 'WARN':
        console.warn(...consoleArgs);
        break;
      case 'ERROR':
        console.error(...consoleArgs);
        break;
      case 'DEBUG':
        console.debug(...consoleArgs);
        break;
      default:
        console.log(...consoleArgs);
    }

    // Broadcast the structured log
    if (this.isInitialized) {
      try {
        this.broadcaster(logEntry);
      } catch (e) {
        // Avoid recursive logging
        console.warn('Logger broadcaster threw', e);
      }
    }
  }

  /**
   * Logs an informational message.
   * @param message The main log message.
   * @param context Optional structured data.
   */
  public info(message: string, context?: Record<string, unknown>): void {
    this.log('INFO', message, context);
  }

  /**
   * Logs a warning message.
   * @param message The main log message.
   * @param context Optional structured data.
   */
  public warn(message: string, context?: Record<string, unknown>): void {
    this.log('WARN', message, context);
  }

  /**
   * Logs an error message.
   * @param message The main log message.
   * @param error The Error object.
   * @param context Optional additional structured data.
   */
  public error(
    message: string,
    error?: unknown,
    context?: Record<string, unknown>
  ): void {
    const errorContext = {
      ...context,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : {
              name: 'UnknownError',
              message: String(error),
            },
    };

    let finalMessage = message;
    const errorMessage = errorContext.error.message;
    // Append the specific error message to the general log message for better UI visibility.
    if (errorMessage && errorMessage !== 'undefined' && errorMessage !== 'null' && errorMessage !== message) {
      finalMessage = `${message}: ${errorMessage}`;
    }

    this.log('ERROR', finalMessage, errorContext);
  }

  /**
   * Logs a debug message.
   * @param message The main log message.
   * @param context Optional structured data.
   */
  public debug(message: string, context?: Record<string, unknown>): void {
    this.log('DEBUG', message, context);
  }
}

/**
 * The singleton instance of the Logger.
 * Import this instance to use it across the application.
 */
export const logger = Logger.getInstance();
