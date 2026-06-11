import type { InternalApiQuery } from '@tuturuuu/internal-api/client';
import type {
  CalendarConnection,
  TaskWithScheduling,
  WorkspaceCalendar,
} from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

export interface WorkspaceCalendarEventUpdatePayload {
  locked?: boolean;
  title?: string;
  description?: string | null;
  location?: string | null;
  start_at?: string;
  end_at?: string;
  color?: string;
  source?: CalendarSourceInput;
}

export type CalendarSourceInput =
  | {
      provider: 'tuturuuu';
      workspaceCalendarId?: string | null;
    }
  | {
      provider: 'google' | 'microsoft';
      connectionId: string;
    };

export type CalendarSourceOption =
  | {
      id: string;
      provider: 'tuturuuu';
      workspaceCalendarId: string;
      label: string;
      color: string | null;
      primary?: boolean;
      writable: boolean;
    }
  | {
      id: string;
      provider: 'google' | 'microsoft';
      connectionId: string;
      workspaceCalendarId: string | null;
      externalCalendarId: string;
      accessRole: string | null;
      accountEmail: string | null;
      accountName: string | null;
      label: string;
      color: string | null;
      writable: boolean;
    };

export interface CalendarDefaultSourceResponse {
  defaultSource: CalendarSourceOption;
  options: CalendarSourceOption[];
}

export interface WorkspaceCalendarEventCreatePayload {
  title: string;
  start_at: string;
  end_at: string;
  description?: string | null;
  location?: string | null;
  color?: string;
  locked?: boolean;
  task_id?: string | null;
  source?: CalendarSourceInput;
}

export type WorkspaceCalendarEventsQuery = InternalApiQuery & {
  start_at?: string;
  end_at?: string;
};

export interface WorkspaceCalendarEventsResponse {
  data: CalendarEvent[];
  count: number;
}

export interface WorkspaceCalendarPayload {
  name: string;
  description?: string | null;
  color?: string | null;
  is_enabled?: boolean;
  position?: number;
}

export interface WorkspaceCalendarUpdatePayload
  extends Partial<WorkspaceCalendarPayload> {
  id: string;
}

export interface WorkspaceCalendarsResponse {
  calendars: WorkspaceCalendar[];
  grouped: {
    custom: WorkspaceCalendar[];
    system: WorkspaceCalendar[];
  };
  total: number;
}

export interface CalendarResetResponse {
  authTokensDeactivated: number;
  calendarConnectionsDeleted: number;
  eventsDeleted: number;
  message: string;
  success: true;
}

export interface CalendarCategory {
  id: string;
  ws_id?: string;
  name: string;
  color: string | null;
  position: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CalendarCategoryPayload {
  name: string;
  color?: string | null;
}

export interface CalendarCategoriesResponse {
  categories: CalendarCategory[];
}

export interface CalendarCategoriesReorderPayload {
  categories: Array<{
    id: string;
    position: number;
  }>;
}

export interface SchedulePreviewRequestPayload {
  windowDays?: number;
  clientTimezone?: string;
}

export interface ScheduleApplyRequestPayload
  extends SchedulePreviewRequestPayload {
  forceReschedule?: boolean;
  mode?: 'safe-apply' | 'full-apply';
  scope?: 'impacted-only' | 'full-window';
  warnings?: string[];
  summary?: {
    totalEvents: number;
    habitsScheduled: number;
    tasksScheduled: number;
    partiallyScheduledTasks: number;
    unscheduledTasks: number;
  };
  previewEvents?: Array<Record<string, unknown> | unknown>;
}

export interface SchedulableTasksResponse {
  tasks: TaskWithScheduling[];
}

export interface CalendarConnectionPayload {
  accessRole?: string;
  authTokenId?: string;
  calendarId: string;
  calendarName: string;
  color?: string | null;
  isEnabled?: boolean;
}

export interface CalendarConnectionUpdatePayload
  extends Partial<CalendarConnectionPayload> {
  id?: string;
  wsId?: string;
}

export interface CalendarConnectionResponse {
  connection: CalendarConnection;
}

export interface CalendarConnectionsResponse {
  connections: CalendarConnection[];
}

export interface CalendarAccount {
  id: string;
  provider: 'google' | 'microsoft' | string;
  account_email: string | null;
  account_name: string | null;
  is_active: boolean | null;
  created_at: string | null;
  expires_at: string | null;
}

export interface CalendarAccountsResponse {
  accounts: CalendarAccount[];
  grouped: {
    google: CalendarAccount[];
    microsoft: CalendarAccount[];
  };
  total: number;
}

export interface CalendarAccountDisconnectResponse {
  message: string;
  success: true;
}

export interface CalendarAuthUrlResponse {
  authUrl: string;
}

export interface ProviderCalendar {
  id: string;
  name: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  accessRole?: string;
  provider?: 'google' | 'microsoft';
  accountId: string;
  accountEmail?: string | null;
}

export interface ProviderCalendarsResponse {
  accounts: Array<{
    id: string;
    provider?: string;
    email?: string | null;
    name?: string | null;
  }>;
  byAccount: Record<string, ProviderCalendar[]>;
  calendars: ProviderCalendar[];
}

export interface CalendarScheduleStatusResponse {
  lastScheduledAt: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
  statistics: {
    habitsScheduled: number;
    tasksScheduled: number;
    eventsCreated: number;
    bumpedHabits: number;
    windowDays: number;
  };
  schedulableItems: {
    activeHabits: number;
    autoScheduleTasks: number;
  };
  mode: 'personal' | 'workspace';
}
