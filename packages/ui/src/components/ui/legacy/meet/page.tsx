import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { getLocale } from 'next-intl/server';
import { PlansPageContent } from './plans-page-content';

// Extended interface to include participants
export interface MeetTogetherPlanWithParticipants extends MeetTogetherPlan {
  participants?: Array<{
    user_id: string | null;
    display_name: string | null;
    is_guest: boolean | null;
    timeblock_count: number | null;
    plan_id: string | null;
  }>;
}

type MeetTogetherPlanRow = Record<string, unknown> & {
  created_at?: string | null;
  creator_id?: string | null;
  description?: string | null;
  id?: string | null;
  name?: string | null;
  ws_id?: string | null;
};

// Server component props type
interface MeetTogetherPageProps {
  scope?: MeetTogetherPlansScope;
  wsId?: string;
  path?: string;
  searchParams?: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
  }>;
}

export type MeetTogetherPlansScope = 'workspace' | 'personal-consolidated';

export async function MeetTogetherPage({
  scope = 'workspace',
  wsId,
  path,
  searchParams,
}: MeetTogetherPageProps) {
  const locale = await getLocale();

  const resolvedSearchParams = await searchParams;
  const page = parseInt(resolvedSearchParams?.page || '1', 10);
  const pageSize = parseInt(resolvedSearchParams?.pageSize || '9', 10);

  const {
    data: plans,
    user,
    totalCount,
  } = await getMeetTogetherPlansData({ scope, wsId, page, pageSize });
  return (
    <PlansPageContent
      locale={locale}
      page={page}
      pageSize={pageSize}
      path={path}
      plans={plans}
      totalCount={totalCount}
      user={user}
      wsId={wsId}
    />
  );
}

export async function getMeetTogetherPlansData({
  scope = 'workspace',
  wsId,
  page = 1,
  pageSize = 9,
}: {
  scope?: MeetTogetherPlansScope;
  wsId?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: [], totalCount: 0, user };

  const sbAdmin = await createAdminClient();

  const planMap = new Map<string, MeetTogetherPlan>();
  const addPlans = (plans: MeetTogetherPlanRow[] | null | undefined) => {
    plans?.forEach((plan) => {
      const planId = plan.id ?? undefined;

      if (planId && !planMap.has(planId)) {
        planMap.set(planId, {
          ...plan,
          agenda_content: plan.agenda_content ?? undefined,
          created_at: plan.created_at ?? undefined,
          creator_id: plan.creator_id ?? undefined,
          description: plan.description ?? undefined,
          id: planId,
          name: plan.name ?? undefined,
          ws_id: plan.ws_id ?? undefined,
        } as MeetTogetherPlan);
      }
    });
  };

  if (scope === 'personal-consolidated' && wsId) {
    const personalPlansQuery = sbAdmin
      .from('meet_together_plans')
      .select('*')
      .eq('creator_id', user.id)
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false });

    const interactedPlansQuery = sbAdmin
      .from('meet_together_user_timeblocks')
      .select('...meet_together_plans!inner(*)')
      .eq('user_id', user.id)
      .order('created_at', {
        ascending: false,
        referencedTable: 'meet_together_plans',
      });

    const [personalPlansResult, interactedPlansResult] = await Promise.all([
      personalPlansQuery,
      interactedPlansQuery,
    ]);

    addPlans(personalPlansResult.data);
    addPlans(interactedPlansResult.data);
  } else {
    const createdPlansQuery = sbAdmin
      .from('meet_together_plans')
      .select('*')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false });

    const joinedPlansQuery = sbAdmin
      .from('meet_together_user_timeblocks')
      .select('...meet_together_plans!inner(*)')
      .eq('user_id', user.id)
      .neq('meet_together_plans.creator_id', user.id)
      .order('created_at', {
        ascending: false,
        referencedTable: 'meet_together_plans',
      });

    if (wsId) {
      createdPlansQuery.eq('ws_id', wsId);
      joinedPlansQuery.eq('meet_together_plans.ws_id', wsId);
    }

    const [createdPlansResult, joinedPlansResult] = await Promise.all([
      createdPlansQuery,
      joinedPlansQuery,
    ]);

    addPlans(createdPlansResult.data);
    addPlans(joinedPlansResult.data);
  }

  const allPlans = Array.from(planMap.values()).sort(
    (a, b) =>
      new Date(b.created_at || 0).getTime() -
      new Date(a.created_at || 0).getTime()
  );

  // Apply pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize;
  const paginatedPlans = allPlans.slice(from, to);

  const planIds =
    paginatedPlans
      ?.map((plan) => plan.id)
      .filter((id): id is string => Boolean(id)) || [];

  let participantsData: {
    user_id: string | null;
    display_name: string | null;
    is_guest: boolean | null;
    timeblock_count: number | null;
    plan_id: string | null;
  }[] = [];

  if (planIds.length > 0) {
    const { data } = await sbAdmin
      .from('meet_together_users')
      .select('user_id, display_name, plan_id, is_guest, timeblock_count')
      .in('plan_id', planIds);

    participantsData = data || [];
  }

  const plansWithParticipants = paginatedPlans.map((plan) => ({
    ...plan,
    participants: plan.id
      ? participantsData.filter((p) => p.plan_id === plan.id)
      : [],
  }));

  return {
    data: plansWithParticipants as MeetTogetherPlanWithParticipants[],
    user,
    totalCount: allPlans.length, // Use actual count after deduplication
  };
}
