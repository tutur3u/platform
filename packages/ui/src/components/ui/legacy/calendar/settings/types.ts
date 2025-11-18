export interface Workspace {
  id: string;
  name: string;
  color: string;
}

export interface User {
  id: string;
  display_name: string;
  avatar: string | null;
}

export interface SyncLog {
  id: string;
  timestamp: string;
  type: 'active' | 'background' | 'manual';
  workspace: Workspace;
  triggeredBy: User | null;
  status: 'completed' | 'failed' | 'running';
  duration: number;
  events: {
    added: number;
    updated: number;
    deleted: number;
  };
  calendarSource: string;
  error?: string | null;

  // Performance timing breakdowns (in milliseconds)
  timings?: {
    googleApiFetchMs?: number | null;
    tokenOperationsMs?: number | null;
    eventProcessingMs?: number | null;
    databaseWritesMs?: number | null;
    totalMs?: number | null;
  };

  // API performance metrics
  apiMetrics?: {
    callsCount?: number;
    pagesFetched?: number;
    retryCount?: number;
    errorCode?: string | null;
  };

  // Data volume metrics
  dataVolume?: {
    eventsFetchedTotal?: number;
    eventsFilteredOut?: number;
    batchCount?: number;
    payloadSizeBytes?: number | null;
  };

  // Error tracking
  errorDetails?: {
    message?: string | null;
    type?:
      | 'auth'
      | 'network'
      | 'api_limit'
      | 'validation'
      | 'database'
      | 'unknown'
      | null;
    stackTrace?: string | null;
    failedEventIds?: string[] | null;
  };

  // Calendar-specific metrics
  calendarMetrics?: {
    calendarIdsSynced?: string[] | null;
    connectionCount?: number;
  };

  // Sync coordination and context
  syncContext?: {
    wasBlockedByCooldown?: boolean;
    cooldownRemainingSeconds?: number | null;
    syncTokenUsed?: boolean;
    dateRangeStart?: string | null;
    dateRangeEnd?: string | null;
    triggeredFrom?:
      | 'ui_button'
      | 'auto_refresh'
      | 'trigger_dev'
      | 'api_call'
      | null;
  };
}

export interface TimeSeriesData {
  time: string;
  syncs: number;
  success: number;
  failed: number;
  events: number;
  duration: number;
}

export interface EventTypeData {
  period: string;
  added: number;
  updated: number;
  deleted: number;
}

export interface WorkspaceActivityData {
  name: string | null;
  syncs: number;
  events: number;
  success: number;
  color: string;
}

export interface CalendarSourceData extends Record<string, unknown> {
  name: string;
  value: number;
  color: string;
}
