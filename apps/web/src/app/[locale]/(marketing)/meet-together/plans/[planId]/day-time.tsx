import PreviewDayTime from './preview-day-time';
import SelectableDayTime from './selectable-day-time';
import { Timeblock } from '@tutur3u/types/primitives/Timeblock';

export default function DayTime({
  editable,
  ...props
}: {
  timeblocks: Timeblock[];
  date: string;
  start: number;
  end: number;
  editable: boolean;
  disabled: boolean;
}) {
  if (editable) return <SelectableDayTime {...props} />;
  return <PreviewDayTime {...props} />;
}
