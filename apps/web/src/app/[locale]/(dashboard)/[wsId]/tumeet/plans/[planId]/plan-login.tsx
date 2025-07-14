'use client';

import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import type { User } from '@tuturuuu/types/primitives/User';
import { useTranslations } from 'next-intl';
import AvailabilityPlanner from './availability-planner';
import { useTimeBlocking } from './time-blocking-provider';

export default function PlanLogin({
  plan,
  timeblocks,
  platformUser,
}: {
  plan: MeetTogetherPlan;
  timeblocks: Timeblock[];
  platformUser: User | null;
}) {
  const t = useTranslations('meet-together-plan-details');
  const { user } = useTimeBlocking();

  return (
    <div className="flex flex-col gap-4">
      {platformUser && (
        <div className="rounded border border-foreground/20 bg-foreground/5 p-3 text-center">
          <div className="text-sm opacity-80">
            {t('logged_in_as')}{' '}
            <span className="font-semibold">
              {platformUser.display_name || platformUser.email}
            </span>
          </div>
        </div>
      )}

      <AvailabilityPlanner
        plan={plan}
        timeblocks={timeblocks.filter((tb) => tb.user_id === user?.id)}
        disabled={!user}
      />
    </div>
  );
}
