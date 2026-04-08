'use client';

import type { MeetTogetherPlan } from '@ncthub/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@ncthub/types/primitives/Timeblock';
import { Separator } from '@ncthub/ui/separator';
import { cn } from '@/lib/utils';
import EditPlanDialog from './edit-plan-dialog';
import PlanLogin from './plan-login';
import PlanUserFilter from './plan-user-filter';
import { useTimeBlocking } from './time-blocking-provider';
import UnifiedAvailability from './unified-availability';
import UtilityButtons from './utility-buttons';

interface PlanUser {
  id: string | null;
  display_name: string | null;
  is_guest: boolean | null;
  timeblock_count: number | null;
}

interface PlanDetailsClientProps {
  plan: MeetTogetherPlan;
  users: PlanUser[];
  timeblocks: Timeblock[];
}

export default function PlanDetailsClient({
  plan,
  users,
  timeblocks,
}: PlanDetailsClientProps) {
  const { user } = useTimeBlocking();
  const isCreator = user?.id === plan.creator_id;

  return (
    <>
      <div className="flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:px-6 lg:gap-10 lg:px-10">
        <div className="flex w-full flex-col items-center">
          <UtilityButtons plan={plan} />

          <div className="mt-6 flex w-full flex-col items-center gap-4 text-center">
            <div className="flex max-w-3xl items-center justify-center gap-2 text-balance font-semibold text-2xl leading-tight md:text-3xl">
              <span>{plan.name}</span>
              {isCreator ? <EditPlanDialog plan={plan} /> : null}
            </div>
          </div>

          <div
            className={cn(
              'mt-8 grid w-full grid-cols-1 items-start justify-between gap-4 md:grid-cols-3'
            )}
          >
            <div className={cn('md:col-span-2')}>
              <UnifiedAvailability plan={plan} timeblocks={timeblocks} />
            </div>
            <div className="xl:sticky xl:top-6">
              <PlanUserFilter users={users} compact />
            </div>
          </div>

          {users.length > 0 ? <Separator className="my-8" /> : null}
        </div>
      </div>
      <PlanLogin plan={plan} />
    </>
  );
}
