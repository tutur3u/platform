'use client';

import { timetzToHour } from '@/utils/date-helper';
import TimeColumn from './time-column';
import DayPlanners from './day-planners';
import { Timeblock } from '@/types/primitives/Timeblock';
import { useTimeBlocking } from './time-blocking-provider';

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
      className="mt-4 flex w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] items-start justify-center gap-2 md:w-96 md:max-w-96 lg:w-[32rem] lg:max-w-lg xl:w-[42rem] xl:max-w-2xl"
    >
      <TimeColumn
        id={editable ? 'self' : 'group'}
        start={startHour}
        end={endHour}
        className="flex-initial"
      />

      {dates && (
        <div
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
            disabled={user ? disabled : true}
          />
        </div>
      )}
    </div>
  );
}
