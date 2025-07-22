import { getPlan } from './helpers';
import PlanDetailsClient from './plan-details-client';
import { TimeBlockingProvider } from './time-blocking-provider';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
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
            <PlanDetailsClient
              plan={plan}
              platformUser={platformUser}
              users={users}
              timeblocks={timeblocks}
            />
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
