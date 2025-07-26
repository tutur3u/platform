'use client';

import DatePlanner from './date-planner';
import { useTimeBlocking } from './time-blocking-provider';
import TimezoneIndicator from './timezone-indicator';
import TimezoneToggle from './timezone-toggle';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function AvailabilityPlanner({
  plan,
  showBestTimes = false,
  onBestTimesStatusByDateAction,
}: {
  plan: MeetTogetherPlan;
  timeblocks: Timeblock[];
  showBestTimes?: boolean;
  onBestTimesStatusByDateAction?: (status: Record<string, boolean>) => void;
}) {
  const t = useTranslations('meet-together-plan-details');
  const { selectedTimeBlocks } = useTimeBlocking();
  const [showLocalTime, setShowLocalTime] = useState(false);

  const localTimeblocks = selectedTimeBlocks.data.map((tb) => ({
    ...tb,
    user_id: 'self',
  }));

  return (
    <div className="flex flex-col gap-2 text-center">
      {/* Existing UI */}
      <div className="font-semibold">{t('your_availability')}</div>

      {/* Timezone Indicator */}
      <TimezoneIndicator plan={plan} />

      {/* Timezone Toggle */}
      <TimezoneToggle
        showLocalTime={showLocalTime}
        onToggle={setShowLocalTime}
      />

      <div className="flex items-center justify-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div>{t('unavailable')}</div>
          <div className="h-4 w-8 border border-foreground/50 bg-red-500/20" />
        </div>

        <div className="flex items-center gap-2">
          <div>{t('available')}</div>
          <div className="h-4 w-8 border border-foreground/50 bg-green-500/70" />
        </div>
      </div>

      <DatePlanner
        timeblocks={localTimeblocks}
        dates={plan.dates}
        start={plan.start_time}
        end={plan.end_time}
        editable={true}
        showBestTimes={showBestTimes}
        showLocalTime={showLocalTime}
        onBestTimesStatusByDateAction={onBestTimesStatusByDateAction}
      />
    </div>
  );
}
