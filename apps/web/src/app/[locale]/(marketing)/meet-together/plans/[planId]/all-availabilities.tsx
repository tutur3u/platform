'use client';

import DatePlanner from './date-planner';
import { useTimeBlocking } from './time-blocking-provider';
import TimezoneIndicator from './timezone-indicator';
import TimezoneToggle from './timezone-toggle';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function AllAvailabilities({
  plan,
  timeblocks,
  showBestTimes = false,
  onBestTimesStatusByDateAction,
}: {
  plan: MeetTogetherPlan;
  timeblocks: Timeblock[];
  showBestTimes?: boolean;
  onBestTimesStatusByDateAction?: (status: Record<string, boolean>) => void;
}) {
  const t = useTranslations('meet-together-plan-details');
  const { user, planUsers, selectedTimeBlocks, filteredUserIds } =
    useTimeBlocking();
  const [showLocalTime, setShowLocalTime] = useState(false);

  const totalUserCount =
    filteredUserIds.length === 0 ? planUsers.length : filteredUserIds.length;

  const localTimeblocks = [
    ...timeblocks.filter((tb) => {
      return tb.user_id !== user?.id;
    }),
    ...selectedTimeBlocks.data.map((tb) => ({
      ...tb,
      user_id: user?.id,
    })),
  ];

  return (
    <div className="flex flex-col gap-2 text-center">
      {/* Existing UI */}
      <div className="font-semibold">{t('everyone_availability')}</div>

      {/* Timezone Indicator */}
      <TimezoneIndicator plan={plan} />

      {/* Timezone Toggle */}
      <TimezoneToggle
        showLocalTime={showLocalTime}
        onToggle={setShowLocalTime}
      />

      <div className="flex items-center justify-center gap-2 text-sm">
        <div>
          0/{totalUserCount} {t('available')}
        </div>
        <div className="flex h-4 w-32 border border-foreground/50">
          {Array.from({ length: totalUserCount + 1 }, (_, i) => ({
            id: `availability-bar-${i}`,
            index: i,
          })).map(({ id, index }) => (
            <div
              key={id}
              style={{
                width: `calc(100% / ${totalUserCount})`,
              }}
              className={`h-full ${
                index < totalUserCount ? 'border-r border-foreground/50' : ''
              }`}
            >
              <div
                className={`h-full w-full ${
                  index === 0 ? 'bg-foreground/10' : 'bg-green-500/70'
                }`}
                style={{
                  opacity: index === 0 ? 1 : index / totalUserCount,
                }}
              />
            </div>
          ))}
        </div>
        <div>
          {totalUserCount}/{totalUserCount} {t('available')}
        </div>
      </div>
      <DatePlanner
        timeblocks={localTimeblocks}
        dates={plan.dates}
        start={plan.start_time}
        end={plan.end_time}
        showBestTimes={showBestTimes}
        showLocalTime={showLocalTime}
        onBestTimesStatusByDateAction={onBestTimesStatusByDateAction}
      />
    </div>
  );
}
