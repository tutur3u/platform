'use client';

import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { timetzToHour } from '@/utils/date-helper';
import DayPlanners from './day-planners';
import { useTimeBlocking } from './time-blocking-provider';
import TimeColumn from './time-column';

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
    <button
      type="button"
      onMouseUp={
        editable
          ? (e) => {
              e.preventDefault();
              endEditing();
            }
          : undefined
      }
      onKeyDown={
        editable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                endEditing();
              }
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
        <button
          type="button"
          className="flex flex-col items-start justify-start gap-4 overflow-x-auto"
          onMouseLeave={
            editable
              ? undefined
              : (e) => {
                  e.preventDefault();
                  setPreviewDate(null);
                }
          }
          onKeyDown={
            editable
              ? undefined
              : (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setPreviewDate(null);
                  }
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
        </button>
      )}
    </button>
  );
}
