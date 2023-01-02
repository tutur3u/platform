type supportedColors =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'purple'
  | 'pink'
  | 'teal'
  | 'indigo'
  | 'cyan'
  | 'gray';

export interface CalendarEventBase {
  id: string;
  title: string;
  start_at: Date;
  end_at: Date;
  color?: supportedColors;
}
