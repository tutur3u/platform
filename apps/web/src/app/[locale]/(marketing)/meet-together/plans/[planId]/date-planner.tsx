'use client';

import DayPlanners from './day-planners';
import { useTimeBlocking } from './time-blocking-provider';
import TimeColumn from './time-column';
import { timetzToHour } from '@/utils/date-helper';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useState } from 'react';

export default function DatePlanner({
  timeblocks,
  dates,
  start,
  end,
  editable = false,
  disabled = false,
  showBestTimes = false,
  onBestTimesStatusByDateAction,
}: {
  timeblocks: Timeblock[];
  dates?: string[];
  start?: string;
  end?: string;
  editable?: boolean;
  disabled?: boolean;
  showBestTimes?: boolean;
  onBestTimesStatusByDateAction?: (status: Record<string, boolean>) => void;
}) {
  const { user, editing, endEditing, setPreviewDate } = useTimeBlocking();
  const [tentativeMode, setTentativeMode] = useState(false);

  const startHour = timetzToHour(start);
  const endHour = timetzToHour(end);

  if (!startHour || !endHour) return null;

  return (
    <div className="mt-4 flex flex-col gap-2">
      {editable && (
        <div className="flex justify-center">
          <Tabs
            value={tentativeMode ? 'tentative' : 'available'}
            onValueChange={(value) => setTentativeMode(value === 'tentative')}
          >
            <TabsList className="h-full rounded-lg bg-gray-100 dark:bg-gray-800">
              <TabsTrigger
                value="available"
                className="px-4 py-1.5 text-lg text-green-700 data-[state=active]:bg-green-100 dark:text-green-300 dark:data-[state=active]:bg-green-900"
              >
                Available
              </TabsTrigger>
              <TabsTrigger
                value="tentative"
                className="px-4 py-1.5 text-lg text-yellow-700 data-[state=active]:bg-yellow-100 dark:text-yellow-300 dark:data-[state=active]:bg-yellow-900"
              >
                Tentative
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

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
              showBestTimes={showBestTimes}
              tentativeMode={tentativeMode}
              onBestTimesStatusByDateAction={onBestTimesStatusByDateAction}
            />
          </div>
        )}
      </div>
    </div>
  );
}
