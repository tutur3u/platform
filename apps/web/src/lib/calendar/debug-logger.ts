export type DebugLogType = 'info' | 'success' | 'warning' | 'error';

export interface DebugLog {
  id: string;
  timestamp: Date;
  type: DebugLogType;
  message: string;
  details?: any;
}

export function logDebug(
  type: DebugLogType,
  message: string,
  details?: any
): void {
  const log: DebugLog = {
    id: `${Date.now()}-${Math.random()}`,
    timestamp: new Date(),
    type,
    message,
    details,
  };

  // Log to console with color coding
  const style =
    type === 'error'
      ? 'color: #ef4444; font-weight: bold'
      : type === 'warning'
        ? 'color: #f59e0b; font-weight: bold'
        : type === 'success'
          ? 'color: #10b981; font-weight: bold'
          : 'color: #3b82f6';

  console.log(
    `%c[CALENDAR ${type.toUpperCase()}]`,
    style,
    message,
    details || ''
  );

  // Dispatch custom event for UI
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('calendar-debug-log', { detail: log })
    );
  }
}
