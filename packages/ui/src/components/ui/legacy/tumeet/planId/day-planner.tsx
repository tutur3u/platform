import DayTime from './day-time';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { useLocale } from 'next-intl';

export default function DayPlanner({
  timeblocks,
  date,
  start,
  end,
  editable,
  disabled,
  showBestTimes = false,
  tentativeMode = false,
  globalMaxAvailable,
  stickyHeader = false,
  hideHeaders = false,
  onBestTimesStatus,
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
  stickyHeader?: boolean;
  hideHeaders?: boolean;
  onBestTimesStatus?: (hasBestTimes: boolean) => void;
}) {
  const locale = useLocale();
  dayjs.locale(locale);

  return (
    <div>
      {!hideHeaders && (
        <div
          className={`pointer-events-none flex flex-col justify-center border border-b-0 border-transparent p-1 select-none ${
            stickyHeader
              ? 'sticky top-0 z-10 bg-root-background/70 backdrop-blur-md'
              : ''
          }`}
        >
          <div className="line-clamp-1 text-xs">
            {dayjs(date)
              .locale(locale)
              .format(locale === 'vi' ? 'DD/MM' : 'MMM D')}
          </div>
          <div className="font-semibold">
            {dayjs(date).locale(locale).format('ddd')}
          </div>
        </div>
      )}

      <DayTime
        timeblocks={timeblocks}
        date={date}
        start={start}
        end={end}
        editable={editable}
        disabled={disabled}
        showBestTimes={showBestTimes}
        tentativeMode={tentativeMode}
        globalMaxAvailable={globalMaxAvailable}
        onBestTimesStatus={onBestTimesStatus}
      />
    </div>
  );
}
