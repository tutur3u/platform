import { createClient } from '@ncthub/supabase/next/server';
import type { SupabaseUser } from '@ncthub/supabase/next/user';
import type { MeetTogetherPlan } from '@ncthub/types/primitives/MeetTogetherPlan';
import { Separator } from '@ncthub/ui/separator';
import Form from './form';
import NeoMeetHeader from './neo-meet-header';
import PlanCard from './plan-card';
import 'dayjs/locale/vi';
import { getLocale, getTranslations } from 'next-intl/server';

interface MeetTogetherPageData {
  data: MeetTogetherPlan[];
  user: SupabaseUser | null;
  createdPlanCount: number;
}

export default async function MeetTogetherPage() {
  const locale = await getLocale();
  const t = await getTranslations('meet-together');
  const { data: plans, user, createdPlanCount } = await getData();

  return (
    <div className="flex w-full flex-col items-center">
      <div className="container mx-auto flex max-w-6xl flex-col gap-6 px-3 py-10 lg:gap-14 lg:py-16">
        <NeoMeetHeader />
      </div>
      <Form
        createdPlanCount={createdPlanCount}
        isLoggedIn={Boolean(user?.id)}
      />
      <Separator className="mt-8 mb-4 md:mt-16" />

      <div className="flex w-full flex-col items-center justify-center p-4 pb-8 text-foreground">
        <h2 className="text-center font-bold text-2xl">{t('your_plans')}</h2>

        {plans?.length > 0 ? (
          <div className="mt-6 grid w-full max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan: MeetTogetherPlan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                locale={locale}
                labels={{
                  planCardLabel: t('plan_card_label'),
                  noDescription: t('plan_card_no_description'),
                  public: t('plan_card_public'),
                  private: t('plan_card_private'),
                }}
              />
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

async function getData(): Promise<MeetTogetherPageData> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: [], createdPlanCount: 0, user };

  const createdPlansQuery = supabase
    .from('meet_together_plans')
    .select('*')
    .eq('creator_id', user.id)
    .order('created_at', { ascending: false });

  const joinedPlansQuery = supabase
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
    .map((item) => ({
      ...item,
      created_at: item.created_at ?? undefined,
      creator_id: item.creator_id ?? undefined,
      description: item.description ?? undefined,
      name: item.name ?? undefined,
    }))
    // filter out duplicates
    .filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i);

  return { data, user, createdPlanCount: createdPlanData.length };
}
