import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';
import { notFound } from 'next/navigation';
import UtilityButtons from './utility-buttons';
import 'dayjs/locale/vi';
import PlanLogin from './plan-login';
import { TimeBlockingProvider } from './time-blocking-provider';
import AllAvailabilities from './all-availabilities';
import { getCurrentUser } from '@/lib/user-helper';
import { Separator } from '@/components/ui/separator';
import EditPlanDialog from './edit-plan-dialog';
import { createAdminClient } from '@/utils/supabase/client';
import PlanUserFilter from './plan-user-filter';

interface Props {
  params: {
    planId: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function MeetTogetherPlanDetailsPage({
  params: { planId },
}: Props) {
  const platformUser = await getCurrentUser(true);

  const plan = await getPlan(planId);
  const users = await getUsers(planId);
  const timeblocks = await getTimeBlocks(planId);

  return (
    <div className="flex min-h-screen w-full flex-col items-center">
      {plan.id && (
        <TimeBlockingProvider
          platformUser={platformUser}
          plan={plan}
          users={users}
          timeblocks={timeblocks}
        >
          <div className="text-foreground flex w-full max-w-6xl flex-col gap-6 px-3 py-8 lg:gap-14">
            <div className="flex w-full flex-col items-center">
              <UtilityButtons plan={plan} platformUser={platformUser} />
              <p className="my-4 flex max-w-xl items-center gap-2 text-center text-2xl font-semibold !leading-tight md:mb-4 lg:text-3xl">
                {plan.name} <EditPlanDialog plan={plan} />
              </p>

              <div className="mt-8 flex w-full flex-col items-start justify-evenly gap-4 md:flex-row">
                <PlanLogin
                  plan={plan}
                  timeblocks={[]}
                  platformUser={platformUser}
                />
                <AllAvailabilities plan={plan} timeblocks={timeblocks} />
              </div>
            </div>
          </div>
          <Separator className="mt-8" />
          <PlanUserFilter users={users} />
        </TimeBlockingProvider>
      )}
    </div>
  );
}

async function getPlan(planId: string) {
  const sbAdmin = createAdminClient();
  if (!sbAdmin) return notFound();

  // planId is an uuid without dashes, so we need to add them back in
  planId = planId.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

  const queryBuilder = sbAdmin
    .from('meet_together_plans')
    .select('*')
    .eq('id', planId)
    .single();

  const { data, error } = await queryBuilder;

  if (error) {
    console.log(error);
    notFound();
  }

  return data as MeetTogetherPlan;
}

async function getUsers(planId: string) {
  const sbAdmin = createAdminClient();
  if (!sbAdmin) return notFound();

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
  const sbAdmin = createAdminClient();
  if (!sbAdmin) return notFound();

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
