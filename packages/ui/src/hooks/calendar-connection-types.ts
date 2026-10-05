import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
// Type for calendar connection
export type CalendarConnection = {
  id: string;
  ws_id: string;
  calendar_id: string;
  calendar_name: string;
  is_enabled: boolean;
  color: string | null;
  provider?: 'google' | 'microsoft' | string;
  auth_token_id?: string | null;
  workspace_calendar_id?: string | null;
  access_role?: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarSyncStatus = {
  state: 'idle' | 'syncing' | 'success' | 'error';
  message?: string;
  lastSyncTime?: Date;
  direction?: 'google-to-tuturuuu' | 'tuturuuu-to-google' | 'both';
};
export type CalendarOptimisticStatus =
  | 'creating'
  | 'updating'
  | 'deleting'
  | 'error';

export type OptimisticCalendarSyncEvent = Partial<
  Omit<CalendarEvent, 'color' | 'description' | 'location'>
> &
  Pick<CalendarEvent, 'id'> & {
    color?: CalendarEvent['color'] | string | null;
    description?: string | null;
    location?: string | null;
    _optimisticStatus?: CalendarOptimisticStatus;
  };

export type OptimisticCalendarPatchOptions = {
  removeIds?: string[];
  clearIds?: string[];
  status?: CalendarOptimisticStatus;
};

export type OptimisticCalendarState = {
  events: Record<string, OptimisticCalendarSyncEvent>;
  removedIds: string[];
};
