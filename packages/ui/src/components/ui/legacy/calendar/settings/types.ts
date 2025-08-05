import type { User, Workspace } from '@tuturuuu/types/db';

export interface SyncLog {
  id: string;
  timestamp: string;
  type: 'active' | 'background' | 'manual';
  workspace: Partial<Workspace>;
  triggeredBy: Partial<User> | null;
  status: 'completed' | 'failed' | 'running';
  duration: number;
  events: {
    added: number;
    updated: number;
    deleted: number;
  };
  calendarSource: string;
  error?: string | null;
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

export interface CalendarSourceData {
  name: string;
  value: number;
  color: string;
}
