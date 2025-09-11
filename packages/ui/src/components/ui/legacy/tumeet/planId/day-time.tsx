import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import PreviewDayTime from './preview-day-time';
import SelectableDayTime from './selectable-day-time';

export default function DayTime({
  editable,
  tentativeMode,
  onBestTimesStatus,
  globalMaxAvailable,
  ...props
}: {
  timeblocks: Timeblock[];
  date: string;
  start: number;
  end: number;
  editable: boolean;
  disabled: boolean;
  showBestTimes?: boolean;
  tentativeMode?: boolean;
  globalMaxAvailable: number;
  onBestTimesStatus?: (hasBestTimes: boolean) => void;
}) {
  if (editable)
    return <SelectableDayTime {...props} tentativeMode={tentativeMode} />;
  return (
    <PreviewDayTime
      {...props}
      globalMaxAvailable={globalMaxAvailable}
      onBestTimesStatus={onBestTimesStatus}
    />
  );
}
