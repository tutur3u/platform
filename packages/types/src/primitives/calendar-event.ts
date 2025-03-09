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
  is_all_day?: boolean;
  scheduling_note?: string;
  priority?: EventPriority;

  // Properties for multi-day events
  _originalId?: string;
  _isMultiDay?: boolean;
  _dayPosition?: 'start' | 'middle' | 'end';
}
