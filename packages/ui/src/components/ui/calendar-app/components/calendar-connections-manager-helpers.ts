import type { CalendarSourceOption } from '@tuturuuu/internal-api/calendar';
import type { ConnectedAccount } from './calendar-types';

export interface AccountsResponse {
  accounts: ConnectedAccount[];
  grouped: {
    google: ConnectedAccount[];
    microsoft: ConnectedAccount[];
  };
  total: number;
}

export interface WorkspaceCalendar {
  id: string;
  ws_id: string;
  name: string;
  description: string | null;
  color: string | null;
  calendar_type: 'primary' | 'tasks' | 'habits' | 'custom';
  is_system: boolean;
  is_enabled: boolean;
  position: number;
}

export interface WorkspaceCalendarsResponse {
  calendars: WorkspaceCalendar[];
  grouped: {
    system: WorkspaceCalendar[];
    custom: WorkspaceCalendar[];
  };
  total: number;
}

export interface ManualSyncResponse {
  ok: boolean;
  alreadyRunning?: boolean;
  code?: string;
  error?: string;
  retryAfterSeconds?: number | null;
}

export function sourceInputFromOption(option: CalendarSourceOption) {
  if (option.provider === 'tuturuuu') {
    return {
      provider: 'tuturuuu' as const,
      workspaceCalendarId: option.workspaceCalendarId,
    };
  }

  return {
    provider: option.provider,
    connectionId: option.connectionId,
  };
}

export function getCalendarColor(color: string) {
  const colors: Record<string, string> = {
    BLUE: '#3b82f6',
    RED: '#ef4444',
    GREEN: '#22c55e',
    YELLOW: '#eab308',
    ORANGE: '#f97316',
    PURPLE: '#a855f7',
    PINK: '#ec4899',
    CYAN: '#06b6d4',
    GRAY: '#6b7280',
  };

  return colors[color.toUpperCase()] || color;
}
