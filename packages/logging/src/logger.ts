import type { LogLevel, LogEntry } from './types.ts';

export interface LoggerOptions {
  service: string;
  level?: LogLevel;
  onLog?: (entry: LogEntry) => void;
}

export class Logger {
  private service: string;
  private level: LogLevel;
  private onLog?: (entry: LogEntry) => void;

  constructor(options: LoggerOptions) {
    this.service = options.service;
    this.level = options.level || 'info';
    this.onLog = options.onLog;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      context,
      error: error?.message
    };

    // Output to console
    const timestamp = entry.timestamp;
    const prefix = '[' + timestamp + '] ' + this.service + ' ' + level.toUpperCase();

    switch (level) {
      case 'debug':
        console.debug(prefix, message, context || '');
        break;
      case 'info':
        console.info(prefix, message, context || '');
        break;
      case 'warn':
        console.warn(prefix, message, context || '');
        break;
      case 'error':
        console.error(prefix, message, context || '', error?.stack || '');
        break;
    }

    // Send to callback
    if (this.onLog) {
      this.onLog(entry);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log('error', message, context, error);
  }
}
