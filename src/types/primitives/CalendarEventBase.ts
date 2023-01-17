import { SupportedColor } from './SupportedColors';

export interface CalendarEventBase {
  id: string;
  title: string;
  start_at: Date;
  end_at: Date;
  color?: SupportedColor;
}
