import DatePlanner from './date-planner';
import { MeetTogetherPlan } from '@ncthub/types/primitives/MeetTogetherPlan';
import { Timeblock } from '@ncthub/types/primitives/Timeblock';
import { useTranslations } from 'next-intl';

export default function AvailabilityPlanner({
  plan,
  timeblocks,
  disabled,
}: {
  plan: MeetTogetherPlan;
  timeblocks: Timeblock[];
  disabled?: boolean;
}) {
  const t = useTranslations('meet-together-plan-details');

  return (
    <div className="flex flex-col gap-2 text-center">
      <div className="font-semibold">{t('your_availability')}</div>

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
