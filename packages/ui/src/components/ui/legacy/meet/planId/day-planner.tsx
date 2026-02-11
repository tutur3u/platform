import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import dayjs from 'dayjs';
import DayTime from './day-time';
import 'dayjs/locale/vi';
import { useLocale } from 'next-intl';
import { memo, useMemo } from 'react';

function DayPlanner({
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

  // Memoize dayjs operations to avoid recreating objects on every render
  const formattedDate = useMemo(() => {
    dayjs.locale(locale);
    const dateObj = dayjs(date).locale(locale);
    return {
      date: dateObj.format(locale === 'vi' ? 'DD/MM' : 'MMM D'),
      day: dateObj.format('ddd'),
    };
  }, [date, locale]);

  return (
    <div>
      {!hideHeaders && (
        <div
          className={`pointer-events-none flex select-none flex-col justify-center border border-transparent border-b-0 p-1 ${
            stickyHeader
              ? 'sticky top-0 z-10 bg-root-background/70 backdrop-blur-md'
              : ''
          }`}
        >
          <div className="line-clamp-1 text-xs">{formattedDate.date}</div>
          <div className="font-semibold">{formattedDate.day}</div>
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

export default memo(DayPlanner);
