export interface CalendarEvent {
  id: string;
  title: string;
  start_at: Date;
  end_at: Date;
  level?: number;
}
