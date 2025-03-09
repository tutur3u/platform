import type { SupportedColor } from './SupportedColors';

export interface CalendarEvent {
  id: string;
  title?: string;
  description?: string;
  start_at: string;
  end_at: string;
  color?: SupportedColor;
  ws_id?: string;
  local?: boolean;

  // Properties for multi-day events
  _originalId?: string;
  _isMultiDay?: boolean;
  _dayPosition?: 'start' | 'middle' | 'end';
}
