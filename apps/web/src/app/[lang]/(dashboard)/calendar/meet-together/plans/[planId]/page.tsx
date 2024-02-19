import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';
import { Database } from '@/types/supabase';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import UtilityButtons from './utility-buttons';
import 'dayjs/locale/vi';
import PlanLogin from './plan-login';
import { TimeBlockingProvider } from './time-blocking-provider';
import AllAvailabilities from './all-availabilities';
import { getCurrentUser } from '@/lib/user-helper';

interface Props {
  params: {
    planId: string;
  };
}

export default async function MeetTogetherPlanDetailsPage({
  params: { planId },
}: Props) {
  const platformUser = await getCurrentUser(true);
  const plan = await getData(planId);

  return (
    <div className="flex min-h-screen w-full flex-col items-center">
      <div className="text-foreground flex w-full max-w-6xl flex-col gap-6 px-3 py-8 lg:gap-14">
        <div className="flex w-full flex-col items-center">
          <TimeBlockingProvider>
            <UtilityButtons plan={plan} platformUser={platformUser} />

            <p className="my-4 max-w-xl text-center text-2xl font-semibold !leading-tight md:mb-4 lg:text-3xl">
              {plan.name}
            </p>

            <div className="mt-8 flex w-full flex-col items-start justify-evenly gap-4 md:flex-row">
              <PlanLogin plan={plan} platformUser={platformUser} />
              <AllAvailabilities plan={plan} />
            </div>
          </TimeBlockingProvider>
        </div>
      </div>
    </div>
  );
}

async function getData(planId: string) {
  const supabase = createServerComponentClient<Database>({ cookies });

  // planId is a uuid without dashes, so we need to add them back in
  planId = planId.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

  const queryBuilder = supabase
    .from('meet_together_plans')
    .select('*')
    .eq('id', planId)
    .single();

  const { data, error } = await queryBuilder;
  if (error) notFound();

  return data as MeetTogetherPlan;
}
