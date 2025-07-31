'use client';

import DayPlanners from './day-planners';
import { useTimeBlocking } from './time-blocking-provider';
import TimeColumn from './time-column';
import { timetzToHour } from '@/utils/date-helper';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('meet-together-plan-details');
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
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-1">
              <TabsTrigger
                value="available"
                className={cn(
                  'flex items-center gap-2 transition-all duration-300',
                  'data-[state=active]:bg-background data-[state=active]:text-dynamic-green data-[state=active]:shadow-md',
                  'hover:border-border/50 hover:bg-accent/60',
                  'rounded-md border border-transparent px-4 py-2'
                )}
              >
                {t('available')}
              </TabsTrigger>
              <TabsTrigger
                value="tentative"
                className={cn(
                  'flex items-center gap-2 transition-all duration-300',
                  'data-[state=active]:bg-background data-[state=active]:text-dynamic-yellow data-[state=active]:shadow-md',
                  'hover:border-border/50 hover:bg-accent/60',
                  'rounded-md border border-transparent px-4 py-2'
                )}
              >
                {t('tentative')}
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
