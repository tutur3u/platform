import type { SupportedColor } from './SupportedColors';
import type { EventAttendeeStatus } from './RSVP';

export interface CalendarEvent {
  id: string;
  title?: string;
  description?: string;
  start_at: string;
  end_at: string;
  color?: SupportedColor;
  ws_id?: string;
  local?: boolean;
  location?: string;
  scheduling_note?: string;
  locked?: boolean;
  google_event_id?: string;

  // Properties for multi-day events
  _originalId?: string;
  _isMultiDay?: boolean;
  _dayPosition?: 'start' | 'middle' | 'end';

  // Properties for overlap calculations
  _level?: number;
  _overlapCount?: number;
  _overlapGroup?: string[];

  // Properties for scheduled events
  _isScheduledEvent?: boolean;
  _scheduledEventId?: string;
  _attendeeStatus?: EventAttendeeStatus;
  _isPending?: boolean;
  _isTentative?: boolean;
  _isCreator?: boolean;
  _attendeeCount?: Readonly<{ total: number } & Record<EventAttendeeStatus, number>>;
}
