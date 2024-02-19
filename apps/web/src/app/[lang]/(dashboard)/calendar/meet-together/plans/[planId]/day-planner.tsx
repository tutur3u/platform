import dayjs from 'dayjs';
import React from 'react';
import DayTime from './day-time';
import useTranslation from 'next-translate/useTranslation';
import 'dayjs/locale/vi';

export default function DayPlanner({
  date,
  start,
  end,
  editable,
  disabled,
}: {
  date: string;
  start: number;
  end: number;
  editable: boolean;
  disabled: boolean;
}) {
  const { lang } = useTranslation();
  dayjs.locale(lang);

  return (
    <div>
      <div className="pointer-events-none select-none p-1">
        <div className="text-xs">
          {dayjs(date)
            .locale(lang)
            .format(lang === 'vi' ? 'DD/MM' : 'MMM D')}
        </div>
        <div className="text-lg font-semibold">
          {dayjs(date).locale(lang).format('ddd')}
        </div>
      </div>

      <DayTime
        date={date}
        start={start}
        end={end}
        editable={editable}
        disabled={disabled}
      />
    </div>
  );
}
