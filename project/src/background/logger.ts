import { LogEntry, LogLevel } from '../shared/types';

/**
 * A structured logger that follows the Singleton pattern.
 * It generates structured log objects and broadcasts them to a configured destination.
 */
export class Logger {
  private static instance: Logger;
  private broadcaster: (log: LogEntry) => void = () => {};
  private isInitialized = false;

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

  private log(level: LogLevel, message: string, context?: object): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

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
    }

    // Broadcast the structured log
    if (this.isInitialized) {
      this.broadcaster(logEntry);
    }
  }

  /**
   * Logs an informational message.
   * @param message The main log message.
   * @param context Optional structured data.
   */
  public info(message: string, context?: object): void {
    this.log('INFO', message, context);
  }

  /**
   * Logs a warning message.
   * @param message The main log message.
   * @param context Optional structured data.
   */
  public warn(message: string, context?: object): void {
    this.log('WARN', message, context);
  }

  /**
   * Logs an error message.
   * @param message The main log message.
   * @param error The Error object.
   * @param context Optional additional structured data.
   */
  public error(message: string, error?: unknown, context?: object): void {
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
    this.log('ERROR', message, errorContext);
  }

  /**
   * Logs a debug message.
   * @param message The main log message.
   * @param context Optional structured data.
   */
  public debug(message: string, context?: object): void {
    this.log('DEBUG', message, context);
  }
}

/**
 * The singleton instance of the Logger.
 * Import this instance to use it across the application.
 */
export const logger = Logger.getInstance();