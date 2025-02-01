import { addMigrationHistory } from './storage';

export type LogLevel = 'info' | 'warning' | 'error' | 'success';

export type LogEntry = {
  timestamp: number;
  level: LogLevel;
  module: string;
  message: string;
  details?: any;
};

class MigrationLogger {
  private static instance: MigrationLogger;
  private logs: LogEntry[] = [];
  private listeners: ((entry: LogEntry) => void)[] = [];

  private constructor() {}

  public static getInstance(): MigrationLogger {
    if (!MigrationLogger.instance) {
      MigrationLogger.instance = new MigrationLogger();
    }
    return MigrationLogger.instance;
  }

  public addListener(callback: (entry: LogEntry) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notify(entry: LogEntry): void {
    this.listeners.forEach((callback) => callback(entry));
  }

  public log(
    level: LogLevel,
    module: string,
    message: string,
    details?: any
  ): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      module,
      message,
      details,
    };

    this.logs.push(entry);
    this.notify(entry);

    // Keep only last 1000 logs
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-1000);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${level.toUpperCase()}][${module}] ${message}`, details);
    }
  }

  public startMigration(module: string): number {
    const startTime = Date.now();
    this.log('info', module, 'Starting migration');
    return startTime;
  }

  public endMigration(
    module: string,
    startTime: number,
    success: boolean,
    itemsProcessed: number,
    error?: any
  ): void {
    const endTime = Date.now();
    const duration = endTime - startTime;

    if (success) {
      this.log('success', module, `Migration completed successfully`, {
        duration,
        itemsProcessed,
      });
    } else {
      this.log('error', module, `Migration failed`, {
        duration,
        itemsProcessed,
        error,
      });
    }

    // Add to migration history
    addMigrationHistory({
      timestamp: endTime,
      module,
      success,
      error: error?.message,
      itemsProcessed,
      duration,
    });
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clear(): void {
    this.logs = [];
  }
}

export const logger = MigrationLogger.getInstance();
