import type { SupportedColor } from './SupportedColors';

export type EventPriority = 'low' | 'medium' | 'high';

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
  priority?: EventPriority;
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
}
