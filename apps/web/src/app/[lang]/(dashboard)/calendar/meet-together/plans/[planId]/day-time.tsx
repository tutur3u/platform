import { Timeblock } from '@/types/primitives/Timeblock';
import SelectableDayTime from './selectable-day-time';
import PreviewDayTime from './preview-day-time';

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
