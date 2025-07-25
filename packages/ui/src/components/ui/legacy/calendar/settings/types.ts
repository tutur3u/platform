export interface Workspace {
  id: string;
  name: string;
  color: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
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
  error?: string;
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
  name: string;
  syncs: number;
  events: number;
  success: number;
  color: string;
}

export interface CalendarSourceData {
  name: string;
  value: number;
  color: string;
}
