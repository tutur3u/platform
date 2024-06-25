import DayTime from './day-time';
import { Timeblock } from '@/types/primitives/Timeblock';
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
}: {
  timeblocks: Timeblock[];
  date: string;
  start: number;
  end: number;
  editable: boolean;
  disabled: boolean;
}) {
  const locale = useLocale();
  dayjs.locale(locale);

  return (
    <div>
      <div className="pointer-events-none select-none p-1">
        <div className="line-clamp-1 text-xs">
          {dayjs(date)
            .locale(locale)
            .format(locale === 'vi' ? 'DD/MM' : 'MMM D')}
        </div>
        <div className="font-semibold">
          {dayjs(date).locale(locale).format('ddd')}
        </div>
      </div>

      <DayTime
        timeblocks={timeblocks}
        date={date}
        start={start}
        end={end}
        editable={editable}
        disabled={disabled}
      />
    </div>
  );
}
