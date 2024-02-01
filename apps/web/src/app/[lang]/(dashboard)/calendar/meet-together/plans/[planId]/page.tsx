import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';
import { Database } from '@/types/supabase';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

interface Props {
  params: {
    planId: string;
  };
}

export default async function MeetTogetherPlanDetailsPage({
  params: { planId },
}: Props) {
  const plan = await getData(planId);

  return (
    <div className="flex w-full flex-col items-center">
      <div className="text-foreground mt-8 flex max-w-6xl flex-col gap-6 px-3 py-8 lg:gap-14">
        <div className="flex flex-col items-center">
          <p className="mx-auto my-4 max-w-xl text-center text-lg font-semibold !leading-tight md:mb-4 md:text-2xl lg:text-3xl">
            <span className="bg-gradient-to-r from-pink-500 via-yellow-500 to-sky-600 bg-clip-text text-transparent dark:from-pink-300 dark:via-amber-300 dark:to-blue-300">
              {plan.name}
            </span>
          </p>
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
