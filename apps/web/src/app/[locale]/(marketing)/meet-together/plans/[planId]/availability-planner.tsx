import DatePlanner from './date-planner';
import { useTimeBlocking } from './time-blocking-provider';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { useTranslations } from 'next-intl';

export default function AvailabilityPlanner({
  plan,
  timeblocks,
  disabled,
  className = '', // allow parent to control alignment
}: {
  plan: MeetTogetherPlan;
  timeblocks: Timeblock[];
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations('meet-together-plan-details');
  const { isDirty } = useTimeBlocking();

  return (
    <div
      className={`flex flex-col items-center ${className}`}
      style={{ minWidth: '260px' }}
    >
      <div className="text-center font-semibold">{t('your_availability')}</div>

      {/* Dirty state indicator with countdown */}
      {isDirty && (
        <div className="mt-2 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          {/*
          <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500"></div>
          {isAutoSaving
            ? 'Auto-saving...'
            : `Auto-save in ${autoSaveCountdown}s`}
          */}
        </div>
      )}

      <div className="mt-1 mb-2 flex items-center justify-center gap-4 text-sm">
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
        timeblocks={timeblocks}
        dates={plan.dates}
        start={plan.start_time}
        end={plan.end_time}
        disabled={disabled}
        editable
      />
    </div>
  );
}
