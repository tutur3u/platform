'use client';

import { timetzToHour } from '@/utils/date-helper';
import TimeColumn from './time-column';
import DayPlanners from './day-planners';
import Debugger from './debugger';

export default function DatePlanner({
  dates,
  start,
  end,
  editable = false,
  disabled = false,
}: {
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
            dates={dates}
            start={startHour}
            end={endHour}
            editable={editable}
            disabled={disabled}
          />
          {editable && <Debugger startTime={startHour} endTime={endHour} />}
        </div>
      )}
    </div>
  );
}
