'use client';

import { timetzToHour } from '@/utils/date-helper';
import TimeColumn from './time-column';
import DayPlanners from './day-planners';
import { Timeblock } from '@/types/primitives/Timeblock';

export default function DatePlanner({
  timeblocks,
  dates,
  start,
  end,
  editable = false,
  disabled = false,
}: {
  timeblocks: Timeblock[];
  dates?: string[];
  start?: string;
  end?: string;
  editable?: boolean;
  disabled?: boolean;
}) {
  const startHour = timetzToHour(start);
  const endHour = timetzToHour(end);

  if (!startHour || !endHour) return null;

  return (
    <div className="mt-4 flex w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] items-start justify-center gap-2 md:w-96 md:max-w-96 lg:w-[32rem] lg:max-w-lg xl:w-[42rem] xl:max-w-2xl">
      <TimeColumn
        id={editable ? 'self' : 'group'}
        start={startHour}
        end={endHour}
        className="flex-initial"
      />

      {dates && (
        <div className="flex flex-col items-start justify-start gap-4 overflow-x-scroll">
          <DayPlanners
            timeblocks={timeblocks}
            dates={dates}
            start={startHour}
            end={endHour}
            editable={editable}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
