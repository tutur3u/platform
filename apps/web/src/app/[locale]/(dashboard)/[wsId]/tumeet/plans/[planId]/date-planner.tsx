'use client';

import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import DayPlanners from './day-planners';
import { useTimeBlocking } from './time-blocking-provider';
import TimeColumn from './time-column';

// Helper function to convert time string to hour number
function timetzToHour(timetz?: string): number | null {
  if (!timetz) return null;

  // Extract time part (HH:MM:SS+TZ format)
  const timePart = timetz.split(/[+-]/)[0];
  if (!timePart) return null;

  const hour = parseInt(timePart.split(':')[0] || '0');
  return isNaN(hour) ? null : hour;
}

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
  const { user, editing, endEditing, setPreviewDate } = useTimeBlocking();

  const startHour = timetzToHour(start);
  const endHour = timetzToHour(end);

  if (!startHour || !endHour) return null;

  return (
    <div
      role={editable ? 'application' : 'presentation'}
      onMouseUp={
        editable
          ? (e) => {
              e.preventDefault();
              endEditing();
            }
          : undefined
      }
      onMouseLeave={
        editable
          ? (e) => {
              e.preventDefault();
              endEditing();
            }
          : undefined
      }
      onTouchEnd={
        editable
          ? () => {
              if (!editing.enabled) return;
              endEditing();
            }
          : undefined
      }
      className="mt-4 flex items-start justify-center gap-2"
    >
      <TimeColumn
        id={editable ? 'self' : 'group'}
        start={startHour}
        end={endHour}
        className="flex-initial"
      />

      {dates && (
        <div
          role="group"
          className="flex flex-col items-start justify-start gap-4 overflow-x-auto"
          onMouseLeave={
            editable
              ? undefined
              : (e) => {
                  e.preventDefault();
                  setPreviewDate(null);
                }
          }
        >
          <DayPlanners
            timeblocks={timeblocks}
            dates={dates}
            start={startHour}
            end={endHour}
            editable={editable}
            disabled={editable ? (user ? disabled : true) : disabled}
          />
        </div>
      )}
    </div>
  );
}
