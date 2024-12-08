import AllAvailabilities from './all-availabilities';
import EditPlanDialog from './edit-plan-dialog';
import { getPlan } from './helpers';
import PlanLogin from './plan-login';
import PlanUserFilter from './plan-user-filter';
import { TimeBlockingProvider } from './time-blocking-provider';
import UtilityButtons from './utility-buttons';
import { getCurrentUser } from '@/lib/user-helper';
import { createAdminClient } from '@/utils/supabase/server';
import { Separator } from '@repo/ui/components/ui/separator';
import 'dayjs/locale/vi';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface Props {
  params: Promise<{
    planId: string;
  }>;
}

export default async function MeetTogetherPlanDetailsPage({ params }: Props) {
  const { planId } = await params;

  const platformUser = await getCurrentUser(true);
  const plan = await getPlan(planId);
  const users = await getUsers(planId);
  const timeblocks = await getTimeBlocks(planId);

  return (
    <div className="flex min-h-screen w-full flex-col items-center">
      <Suspense fallback={null}>
        {plan.id && (
          <TimeBlockingProvider
            key={`${platformUser?.id || 'guest'}-${plan.id}`}
            platformUser={platformUser}
            plan={plan}
            users={users}
            timeblocks={timeblocks}
          >
            <div className="text-foreground flex w-full max-w-6xl flex-col gap-6 p-4 md:px-8 lg:gap-14 lg:px-14">
              <div className="flex w-full flex-col items-center">
                <UtilityButtons plan={plan} platformUser={platformUser} />
                <p className="my-4 flex max-w-xl items-center gap-2 text-center text-2xl font-semibold !leading-tight md:mb-4 lg:text-3xl">
                  {plan.name} <EditPlanDialog plan={plan} />
                </p>

                <div className="mt-8 grid w-full items-center justify-between gap-4 md:grid-cols-2">
                  <PlanLogin
                    plan={plan}
                    timeblocks={[]}
                    platformUser={platformUser}
                  />
                  <AllAvailabilities plan={plan} timeblocks={timeblocks} />
                </div>
              </div>
            </div>

            {users.length > 0 && (
              <>
                <Separator className="mt-8" />
                <PlanUserFilter users={users} />
              </>
            )}
          </TimeBlockingProvider>
        )}
      </Suspense>
    </div>
  );
}

async function getUsers(planId: string) {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('meet_together_users')
    .select('id:user_id, display_name, is_guest, timeblock_count')
    .eq('plan_id', planId);

  if (error) {
    console.log(error);
    return notFound();
  }

  return data;
}

async function getTimeBlocks(planId: string) {
  const sbAdmin = await createAdminClient();

  const guestQueryBuilder = sbAdmin
    .from('meet_together_guest_timeblocks')
    .select('*')
    .eq('plan_id', planId);

  const userQueryBuilder = sbAdmin
    .from('meet_together_user_timeblocks')
    .select('*')
    .eq('plan_id', planId);

  const [guestTimeBlocks, userTimeBlocks] = await Promise.all([
    guestQueryBuilder,
    userQueryBuilder,
  ]);

  if (guestTimeBlocks.error || userTimeBlocks.error) {
    console.log(guestTimeBlocks.error, userTimeBlocks.error);
    return notFound();
  }

  return [
    ...guestTimeBlocks.data.map((tb) => ({
      ...tb,
      is_guest: true,
    })),
    ...userTimeBlocks.data.map((tb) => ({
      ...tb,
      is_guest: false,
    })),
  ];
}
