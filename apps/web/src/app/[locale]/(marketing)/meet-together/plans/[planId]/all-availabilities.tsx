'use client';

import DatePlanner from './date-planner';
import { useTimeBlocking } from './time-blocking-provider';
import { MeetTogetherPlan } from '@repo/types/primitives/MeetTogetherPlan';
import { Timeblock } from '@repo/types/primitives/Timeblock';
import { useTranslations } from 'next-intl';

export default function AllAvailabilities({
  plan,
  timeblocks,
}: {
  plan: MeetTogetherPlan;
  timeblocks: Timeblock[];
}) {
  const t = useTranslations('meet-together-plan-details');
  const { user, planUsers, selectedTimeBlocks, filteredUserIds } =
    useTimeBlocking();

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
      <div className="font-semibold">{t('everyone_availability')}</div>

      <div className="flex items-center justify-center gap-2 text-sm">
        <div>
          0/{totalUserCount} {t('available')}
        </div>
        <div className="flex h-4 w-32 border border-foreground/50">
          {Array.from({ length: totalUserCount + 1 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: `calc(100% / ${totalUserCount})`,
              }}
              className={`h-full ${
                i < totalUserCount ? 'border-r border-foreground/50' : ''
              }`}
            >
              <div
                className={`h-full w-full ${
                  i === 0 ? 'bg-foreground/10' : 'bg-green-500/70'
                }`}
                style={{
                  opacity: i === 0 ? 1 : i / totalUserCount,
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
      />
    </div>
  );
}
