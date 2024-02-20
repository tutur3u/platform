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
    <div className="mt-4 flex items-start justify-center gap-2">
      <TimeColumn
        id={editable ? 'self' : 'group'}
        start={startHour}
        end={endHour}
      />

      {dates && (
        <div className="flex flex-col items-start justify-start gap-4">
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
