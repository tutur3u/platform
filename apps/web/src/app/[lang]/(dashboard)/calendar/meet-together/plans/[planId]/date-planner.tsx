'use client';

import { timetzToHour } from '@/utils/date-helper';
import DayPlanner from './day-planner';
import TimeColumn from './time-column';

export default function DatePlanner({
  dates,
  start,
  end,
}: {
  dates?: string[];
  start?: string;
  end?: string;
}) {
  const startHour = timetzToHour(start);
  const endHour = timetzToHour(end);

  if (!startHour || !endHour) return null;

  return (
    <div className="mt-4 flex items-start justify-center gap-2">
      <TimeColumn start={startHour} end={endHour} />
      {dates?.map((d) => (
        <DayPlanner key={d} date={d} start={startHour} end={endHour} />
      ))}
    </div>
  );
}
