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
  location?: string;
  scheduling_note?: string;
  locked?: boolean;
  google_event_id?: string;
  google_calendar_id?: string; // The Google Calendar ID this event belongs to (e.g., 'primary', 'work@gmail.com')

  // Properties for multi-day events
  _originalId?: string;
  _isMultiDay?: boolean;
  _dayPosition?: 'start' | 'middle' | 'end';

  // Properties for overlap calculations
  _level?: number;
  _overlapCount?: number;
  _overlapGroup?: string[];
  _column?: number; // Column index from graph coloring algorithm (0 = base layer)

  // Properties for calendar layering (populated at runtime)
  _calendarName?: string; // Display name of the source calendar
  _calendarColor?: string; // Color of the source calendar

  // Properties for preview/demo mode (populated at runtime)
  _isPreview?: boolean; // If true, this is a preview event not yet persisted
  _previewStep?: number; // Step number for animated preview playback
  _previewType?: 'habit' | 'task' | 'break'; // Type of preview event
  _previewSourceId?: string; // ID of the source habit/task
}
