'use client';

import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { memo, useMemo } from 'react';
import DatePlanner from './date-planner';

// Memoized progress bar component
const ProgressBar = memo(({ totalUserCount }: { totalUserCount: number }) => {
  const progressBars = useMemo(() => {
    return Array.from({ length: (totalUserCount || 1) + 1 }).map((_, i) => (
      <div
        key={i}
        style={{
          width: `calc(100% / ${totalUserCount || 1} )`,
        }}
        className={`h-full ${
          i < (totalUserCount || 1) ? 'border-foreground/50 border-r' : ''
        }`}
      >
        <div
          className={`h-full w-full ${cn(
            i === 0 ? 'bg-foreground/10' : 'bg-green-500/70',
            i === (totalUserCount || 1) && 'rounded-r-[0.175rem]'
          )}`}
          style={{
            opacity: i === 0 ? 1 : i / (totalUserCount || 1),
          }}
        />
      </div>
    ));
  }, [totalUserCount]);

  return (
    <div className="flex h-4 w-32 rounded border border-foreground/50">
      {progressBars}
    </div>
  );
});

ProgressBar.displayName = 'ProgressBar';

function AllAvailabilities({
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

  // Memoize expensive calculations
  const totalUserCount = useMemo(() => {
    return filteredUserIds.length === 0
      ? planUsers.length
      : filteredUserIds.length;
  }, [filteredUserIds.length, planUsers.length]);

  const localTimeblocks = useMemo(() => {
    return [
      ...timeblocks.filter((tb) => {
        return tb.user_id !== user?.id;
      }),
      ...selectedTimeBlocks.data.map((tb) => ({
        ...tb,
        user_id: user?.id,
      })),
    ];
  }, [timeblocks, user?.id, selectedTimeBlocks.data]);

  return (
    <div className="flex flex-col gap-2 text-center">
      {/* Existing UI */}
      <div className="font-semibold">{t('everyone_availability')}</div>
      <div className="flex items-center justify-center gap-2 text-sm">
        <div>
          0/{totalUserCount} {t('available')}
        </div>
        <ProgressBar totalUserCount={totalUserCount} />
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
        onBestTimesStatusByDateAction={onBestTimesStatusByDateAction}
      />
    </div>
  );
}

export default memo(AllAvailabilities);
