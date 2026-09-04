export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  context?: Record<string, unknown>;
  error?: string;
}


export interface LoggerOptions {
  service: string;
  level?: LogLevel;
  onLog?: (entry: LogEntry) => void;
}
