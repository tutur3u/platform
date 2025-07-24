import PreviewDayTime from './preview-day-time';
import SelectableDayTime from './selectable-day-time';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';

export default function DayTime({
  editable,
  onBestTimesStatus,
  ...props
}: {
  timeblocks: Timeblock[];
  date: string;
  start: number;
  end: number;
  editable: boolean;
  disabled: boolean;
  showBestTimes?: boolean;
  onBestTimesStatus?: (hasBestTimes: boolean) => void;
}) {
  if (editable) return <SelectableDayTime {...props} />;
  return <PreviewDayTime {...props} onBestTimesStatus={onBestTimesStatus} />;
}
