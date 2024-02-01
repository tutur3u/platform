import dayjs from 'dayjs';
import React from 'react';
import DayTime from './day-time';
import useTranslation from 'next-translate/useTranslation';

export default function DayPlanner({
  date,
  start,
  end,
}: {
  date: string;
  start: number;
  end: number;
}) {
  const { lang } = useTranslation();
  dayjs.locale(lang);

  return (
    <div>
      <div className="p-1">
        <div className="text-xs">
          {dayjs(date).format(lang === 'vi' ? 'DD/MM' : 'MMM D')}
        </div>
        <div className="text-lg font-semibold">{dayjs(date).format('ddd')}</div>
      </div>

      <DayTime start={start} end={end} />
    </div>
  );
}
