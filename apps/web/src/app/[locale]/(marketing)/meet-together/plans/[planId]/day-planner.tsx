import DayTime from './day-time';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { useLocale } from 'next-intl';

export default function DayPlanner({
  timeblocks,
  date,
  localStart,
  localEnd,
  editable,
  disabled,
  showBestTimes = false,
  globalMaxAvailable,
  onBestTimesStatus,
  startHour,
  endHour,
}: {
  timeblocks: Timeblock[];
  date: string;
  localStart: Date;
  localEnd: Date;
  editable: boolean;
  disabled: boolean;
  showBestTimes?: boolean;
  globalMaxAvailable: number;
  onBestTimesStatus?: (hasBestTimes: boolean) => void;
  startHour?: number;
  endHour?: number;
}) {
  const locale = useLocale();
  dayjs.locale(locale);

  return (
    <div>
      <div className="pointer-events-none p-1 select-none">
        <div className="line-clamp-1 text-xs">
          {dayjs(localStart)
            .locale(locale)
            .format(locale === 'vi' ? 'DD/MM' : 'MMM D')}
        </div>
        <div className="font-semibold">
          {dayjs(localStart).locale(locale).format('ddd')}
        </div>
      </div>

      <DayTime
        timeblocks={timeblocks}
        date={date}
        start={
          typeof startHour === 'number' ? startHour : localStart.getHours()
        }
        end={typeof endHour === 'number' ? endHour : localEnd.getHours()}
        editable={editable}
        disabled={disabled}
        showBestTimes={showBestTimes}
        globalMaxAvailable={globalMaxAvailable}
        onBestTimesStatus={onBestTimesStatus}
      />
    </div>
  );
}
