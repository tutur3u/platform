import Form from './form';
import UserTime from './user-time';
import GradientHeadline from '@/app/[locale]/(marketing)/gradient-headline';
import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';
import { createAdminClient, createClient } from '@repo/supabase/next/server';
import type { SupabaseUser } from '@repo/supabase/next/user';
import { Separator } from '@repo/ui/components/ui/separator';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function MeetTogetherPage() {
  const locale = await getLocale();
  const t = await getTranslations('meet-together');
  const { data: plans, user } = await getData();

  return (
    <div className="flex w-full flex-col items-center">
      <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
        <div className="flex flex-col items-center">
          <h1 className="text-foreground mx-auto mb-2 text-center text-2xl !leading-tight font-bold tracking-tight text-balance md:text-4xl lg:text-6xl">
            {t('headline-p1')}{' '}
            <GradientHeadline>{t('headline-p2')}</GradientHeadline>.
          </h1>
        </div>
      </div>
      <Form />
      <Separator className="mt-8 mb-4 md:mt-16" />

      <div className="text-foreground flex w-full flex-col items-center justify-center p-4 pb-8">
        <h2 className="text-center text-2xl font-bold">{t('your_plans')}</h2>

        {plans?.length > 0 ? (
          <div className="mt-4 grid w-full max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan: MeetTogetherPlan) => (
              <Link
                href={`/meet-together/plans/${plan.id?.replace(/-/g, '')}`}
                key={plan.id}
                className="border-foreground/20 hover:border-foreground group grid w-full rounded-lg border p-4"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <h3 className="line-clamp-1 w-full flex-1 font-bold">
                    {plan.name}
                  </h3>
                  {plan.start_time && (
                    <div className="bg-foreground text-background rounded px-2 py-0.5 text-sm font-semibold">
                      GMT
                      {Intl.NumberFormat('en-US', {
                        signDisplay: 'always',
                      }).format(
                        parseInt(plan.start_time?.split(/[+-]/)?.[1] ?? '0') *
                          (plan.start_time?.includes('-') ? -1 : 1)
                      )}
                    </div>
                  )}
                </div>

                <div className="flex grow flex-col justify-between gap-4">
                  {plan.description && (
                    <p className="text-sm opacity-80">{plan.description}</p>
                  )}

                  {plan.start_time && plan.end_time && (
                    <div className="opacity-60 group-hover:opacity-100">
                      <span className="font-semibold">
                        <UserTime time={plan.start_time} /> -{' '}
                        <UserTime time={plan.end_time} />
                      </span>{' '}
                      ({t('local_time')})
                    </div>
                  )}
                </div>

                {plan.dates && plan.dates.length > 0 && (
                  <>
                    <Separator className="my-2" />
                    <div className="flex h-full flex-wrap gap-2 text-center">
                      {plan.dates?.slice(0, 5).map((date) => (
                        <div
                          key={date}
                          className={`bg-foreground/20 flex items-center justify-center rounded px-2 py-0.5 text-sm ${(plan.dates?.length || 0) <= 2 && 'w-full'}`}
                        >
                          {dayjs(date)
                            .locale(locale)
                            .format(
                              `${locale === 'vi' ? 'DD/MM (ddd)' : 'MMM D (ddd)'}`
                            )}
                        </div>
                      ))}
                      {plan.dates.length > 5 && (
                        <div className="bg-foreground/20 rounded px-2 py-0.5 text-sm">
                          +{plan.dates.length - 5}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-center text-sm opacity-60">
            {user?.id ? t('no_plans_yet') : t('login_to_save_plans')}
          </p>
        )}
      </div>
    </div>
  );
}

async function getData() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: [], count: 0, user };

  const sbAdmin = await createAdminClient();

  const createdPlansQuery = sbAdmin
    .from('meet_together_plans')
    .select('*')
    .eq('creator_id', user.id)
    .order('created_at', { ascending: false });

  const joinedPlansQuery = sbAdmin
    .from('meet_together_user_timeblocks')
    .select('...meet_together_plans(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const [createdPlans, joinedPlans] = await Promise.all([
    createdPlansQuery,
    joinedPlansQuery,
  ]);

  const { data: createdPlanData, error: createdPlansError } = createdPlans;
  const { data: joinedPlanData, error: joinedPlansError } = joinedPlans;

  if (createdPlansError) throw createdPlansError;
  if (joinedPlansError) throw joinedPlansError;

  const data = [...createdPlanData, ...joinedPlanData]
    // filter out duplicates
    .filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i);

  return { data, user } as {
    data: MeetTogetherPlan[];
    user: SupabaseUser;
  };
}
