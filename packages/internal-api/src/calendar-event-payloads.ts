import type { GoogleProviderColorChoice } from '@tuturuuu/types/primitives/google-calendar-color';
import type { CalendarSourceInput } from './calendar';

export interface WorkspaceCalendarEventUpdatePayload {
  providerColor?: GoogleProviderColorChoice;
  locked?: boolean;
  title?: string;
  description?: string | null;
  location?: string | null;
  start_at?: string;
  end_at?: string;
  color?: string;
  source?: CalendarSourceInput;
}

export interface WorkspaceCalendarEventCreatePayload {
  requestId?: string;
  providerColor?: GoogleProviderColorChoice;
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
