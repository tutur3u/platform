'use client';

import { timetzToHour } from '@/utils/date-helper';
import TimeColumn from './time-column';
import { TimeBlockingProvider } from './time-blocking-provider';
import DayPlanners from './day-planners';

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
        <TimeBlockingProvider>
          <DayPlanners
            dates={dates}
            start={startHour}
            end={endHour}
            editable={editable}
            disabled={disabled}
          />
        </TimeBlockingProvider>
      )}
    </div>
  );
}
