import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import Form from './form';
import 'dayjs/locale/vi';
import 'dayjs/plugin/relativeTime';
import { Calendar, UserIcon, Users, Video, Zap } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { GradientHeadline } from '../../custom/gradient-headline';
import { MeetTogetherClient } from './client-wrapper';

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

// Server component props type
interface MeetTogetherPageProps {
  wsId?: string;
  searchParams?: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
  }>;
}

export async function MeetTogetherPage({
  wsId,
  searchParams,
}: MeetTogetherPageProps) {
  const locale = await getLocale();
  const t = await getTranslations('meet-together');
  const tCommon = await getTranslations('common');

  const resolvedSearchParams = await searchParams;
  const page = parseInt(resolvedSearchParams?.page || '1');
  const pageSize = parseInt(resolvedSearchParams?.pageSize || '9');
  const search = resolvedSearchParams?.search || '';

  const {
    data: plans,
    user,
    totalCount,
  } = await getData({ wsId, page, pageSize, search });
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="relative flex w-full flex-col items-center overflow-hidden">
      {/* Background decorative elements */}
      <div className="-z-10 pointer-events-none absolute inset-0">
        <div className="-left-32 absolute top-20 h-64 w-64 rounded-full bg-dynamic-blue/10 blur-3xl"></div>
        <div className="-right-32 absolute top-32 h-64 w-64 rounded-full bg-dynamic-purple/10 blur-3xl"></div>
        <div className="absolute bottom-1/3 left-1/4 h-40 w-40 rounded-full bg-dynamic-green/5 blur-2xl"></div>
      </div>

      {/* Hero section */}
      <div className="container mx-auto mt-8 flex max-w-5xl flex-col gap-8 px-4 py-16 md:py-24 lg:gap-12">
        <div className="flex flex-col items-center text-center">
          {/* Badge */}
          <Badge variant="secondary" className="mb-6 px-4 py-2">
            <Video className="mr-2 h-4 w-4" />
            {t('meeting_coordination')}
          </Badge>

          {/* Main heading */}
          <h1 className="mb-6 text-balance text-center font-bold text-4xl text-foreground leading-tight tracking-tight md:text-5xl lg:text-6xl">
            {t('headline-p1')}{' '}
            <GradientHeadline className="bg-gradient-to-r from-dynamic-blue via-dynamic-purple to-dynamic-green bg-clip-text">
              {t('headline-p2')}
            </GradientHeadline>
          </h1>

          {/* Subtitle */}
          <p className="mb-8 max-w-2xl text-center text-foreground/70 text-lg leading-relaxed md:text-xl">
            {t('new_plan_desc')}
          </p>

          {/* Features highlights */}
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 rounded-lg bg-dynamic-blue/5 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-blue/10">
                <Calendar className="h-5 w-5 text-dynamic-blue" />
              </div>
              <div className="text-left">
                <p className="font-medium text-foreground text-sm">
                  {t('smart_scheduling')}
                </p>
                <p className="text-foreground/60 text-xs">
                  {t('automatic_coordination')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg bg-dynamic-purple/5 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-purple/10">
                <Users className="h-5 w-5 text-dynamic-purple" />
              </div>
              <div className="text-left">
                <p className="font-medium text-foreground text-sm">
                  {t('group_availability')}
                </p>
                <p className="text-foreground/60 text-xs">
                  {t('find_perfect_time')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg bg-dynamic-green/5 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-green/10">
                <Zap className="h-5 w-5 text-dynamic-green" />
              </div>
              <div className="text-left">
                <p className="font-medium text-foreground text-sm">
                  {t('instant_setup')}
                </p>
                <p className="text-foreground/60 text-xs">
                  {t('minutes_to_create')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form section */}
      <div className="w-full max-w-4xl px-2 md:px-4">
        <Card className="border-border/50 bg-accent/50 backdrop-blur-sm">
          <CardContent className="p-2 md:p-6">
            <Form wsId={wsId} />
          </CardContent>
        </Card>
      </div>

      <Separator className="my-8 md:my-16" />

      {/* Plans section */}
      <div className="flex w-full flex-col items-center justify-center px-4 pb-16">
        <div className="w-full max-w-6xl">
          <div className="mb-8 flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2 text-center sm:text-left">
                <h2 className="font-bold text-2xl text-foreground md:text-3xl">
                  {t('your_plans')}
                </h2>
                {totalCount > 0 && (
                  <p className="text-foreground/60 text-sm">
                    <span className="font-medium text-foreground">
                      {totalCount}
                    </span>{' '}
                    {tCommon('result(s)')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {user?.id ? (
            <MeetTogetherClient
              plans={plans}
              locale={locale}
              totalPages={totalPages}
              totalCount={totalCount}
              currentPage={page}
              pageSize={pageSize}
            />
          ) : (
            <Card className="border-border/50 bg-gradient-to-br from-dynamic-blue/5 to-dynamic-purple/5">
              <CardContent className="flex flex-col items-center justify-center p-16">
                <div className="mb-8 rounded-full bg-dynamic-blue/10 p-8 shadow-sm">
                  <UserIcon className="h-8 w-8 text-dynamic-blue" />
                </div>
                <h3 className="mb-4 font-semibold text-foreground text-xl">
                  {t('login_required')}
                </h3>
                <p className="mb-6 max-w-md text-center text-foreground/70 text-sm leading-relaxed">
                  {t('login_required_desc')}
                </p>
                <div className="flex gap-4">
                  <Button asChild>
                    <Link href="/login">{tCommon('sign_in')}</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/register">{tCommon('create_account')}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

async function getData({
  wsId,
  page = 1,
  pageSize = 9,
  search = '',
}: {
  wsId?: string;
  page?: number;
  pageSize?: number;
  search?: string;
} = {}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: [], totalCount: 0, user };

  const sbAdmin = await createAdminClient();

  try {
    // Get all plans without pagination to properly handle deduplication first
    let createdPlansQuery = sbAdmin
      .from('meet_together_plans')
      .select('*')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false });

    // First, get unique plan IDs from timeblocks (not the full plan data)
    let joinedPlanIdsQuery = sbAdmin
      .from('meet_together_user_timeblocks')
      .select('plan_id')
      .eq('user_id', user.id);

    // Apply workspace filter
    if (wsId) {
      createdPlansQuery = createdPlansQuery.eq('ws_id', wsId);
      joinedPlanIdsQuery = joinedPlanIdsQuery.eq(
        'meet_together_plans.ws_id',
        wsId
      );
    }

    // Execute queries to get created plans and joined plan IDs
    const [createdPlansResult, joinedPlanIdsResult] = await Promise.all([
      createdPlansQuery,
      joinedPlanIdsQuery,
    ]);

    const { data: createdPlanData, error: createdPlansError } =
      createdPlansResult;
    const { data: joinedPlanIdsData, error: joinedPlanIdsError } =
      joinedPlanIdsResult;

    if (createdPlansError) throw createdPlansError;
    if (joinedPlanIdsError) throw joinedPlanIdsError;

    // Get unique plan IDs that the user joined (excluding ones they created)
    const createdPlanIds = new Set(createdPlanData?.map((p) => p.id) || []);
    const uniqueJoinedPlanIds = [
      ...new Set(
        joinedPlanIdsData
          ?.map((item) => item.plan_id)
          .filter((planId) => planId && !createdPlanIds.has(planId)) || []
      ),
    ];

    console.log('=== DEBUG: Plan count analysis ===');
    console.log('Created plans count:', createdPlanData?.length || 0);
    console.log('Unique joined plan IDs count:', uniqueJoinedPlanIds.length);
    console.log('User ID:', user.id);
    console.log('Workspace ID:', wsId);
    console.log('Search term:', search);

    let finalCreatedPlanData = createdPlanData;
    let joinedPlanData: {
      id: string;
    }[] = [];

    // Fetch the actual plan data for joined plans if there are any
    if (uniqueJoinedPlanIds.length > 0) {
      let joinedPlansQuery = sbAdmin
        .from('meet_together_plans')
        .select('*')
        .in('id', uniqueJoinedPlanIds)
        .order('created_at', { ascending: false });

      // Apply workspace filter to joined plans query
      if (wsId) {
        joinedPlansQuery = joinedPlansQuery.eq('ws_id', wsId);
      }

      // Apply search filter to both queries
      if (search) {
        const searchPattern = `%${search}%`;
        createdPlansQuery = sbAdmin
          .from('meet_together_plans')
          .select('*')
          .eq('creator_id', user.id)
          .or(`name.ilike.${searchPattern},description.ilike.${searchPattern}`)
          .order('created_at', { ascending: false });

        joinedPlansQuery = joinedPlansQuery.or(
          `name.ilike.${searchPattern},description.ilike.${searchPattern}`
        );

        if (wsId) {
          createdPlansQuery = createdPlansQuery.eq('ws_id', wsId);
        }

        // Re-execute with search filters
        const [filteredCreatedResult, filteredJoinedResult] = await Promise.all(
          [createdPlansQuery, joinedPlansQuery]
        );

        const { data: filteredCreatedData, error: filteredCreatedError } =
          filteredCreatedResult;
        const { data: filteredJoinedData, error: filteredJoinedError } =
          filteredJoinedResult;

        if (filteredCreatedError) throw filteredCreatedError;
        if (filteredJoinedError) throw filteredJoinedError;

        // Use filtered results
        finalCreatedPlanData = filteredCreatedData;
        joinedPlanData = filteredJoinedData || [];
      } else {
        const { data, error } = await joinedPlansQuery;
        if (error) throw error;
        joinedPlanData = data || [];
      }
    }

    console.log(
      'Joined plans count after fetching details:',
      joinedPlanData.length
    );

    // Combine and deduplicate plans efficiently using Map
    const planMap = new Map();

    // Add created plans
    finalCreatedPlanData?.forEach((plan) => {
      if (!planMap.has(plan.id)) {
        planMap.set(plan.id, plan);
      }
    });

    // Add joined plans (avoiding duplicates)
    joinedPlanData?.forEach((plan) => {
      if (!planMap.has(plan.id)) {
        planMap.set(plan.id, plan);
      }
    });

    const allPlans = Array.from(planMap.values()).sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
    );

    // Get the actual total count after deduplication
    const actualTotalCount = allPlans.length;

    console.log('Total after deduplication:', actualTotalCount);
    console.log(
      'Plans removed by deduplication:',
      (finalCreatedPlanData?.length || 0) +
        (joinedPlanData?.length || 0) -
        actualTotalCount
    );
    console.log('=====================================');

    // If no plans exist, return early
    if (actualTotalCount === 0) {
      return { data: [], totalCount: 0, user };
    }

    // Apply pagination to the combined and sorted results
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    const paginatedPlans = allPlans.slice(from, to);

    // Fetch participants for paginated plans only (single optimized query)
    const planIds = paginatedPlans
      .map((plan) => plan.id)
      .filter((id): id is string => Boolean(id));

    if (planIds.length > 0) {
      const { data: participantsData, error: participantsError } = await sbAdmin
        .from('meet_together_users')
        .select('user_id, display_name, plan_id, is_guest, timeblock_count')
        .in('plan_id', planIds);

      if (participantsError) {
        console.error('Error fetching participants:', participantsError);
      }

      // Group participants by plan_id for efficient lookup
      const participantsByPlan = new Map<
        string,
        Array<{
          user_id: string | null;
        }>
      >();
      participantsData?.forEach((participant) => {
        const planId = participant.plan_id;
        if (planId && !participantsByPlan.has(planId)) {
          participantsByPlan.set(planId, []);
        }
        if (planId) {
          participantsByPlan.get(planId)?.push(participant);
        }
      });

      const plansWithParticipants = paginatedPlans.map((plan) => ({
        ...plan,
        participants: plan.id ? participantsByPlan.get(plan.id) || [] : [],
      }));

      return {
        data: plansWithParticipants as MeetTogetherPlanWithParticipants[],
        user,
        totalCount: actualTotalCount,
      };
    }

    return {
      data: paginatedPlans.map((plan) => ({
        ...plan,
        participants: [],
      })) as MeetTogetherPlanWithParticipants[],
      user,
      totalCount: actualTotalCount,
    };
  } catch (error) {
    console.error('Optimized query failed, using simplified approach:', error);

    // Simplified fallback approach - get all created and joined plans
    const [createdPlansResult, joinedPlansResult] = await Promise.all([
      sbAdmin
        .from('meet_together_plans')
        .select('*')
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false }),
      sbAdmin
        .from('meet_together_user_timeblocks')
        .select('...meet_together_plans!inner(*)')
        .eq('user_id', user.id)
        .neq('meet_together_plans.creator_id', user.id)
        .order('created_at', {
          ascending: false,
          referencedTable: 'meet_together_plans',
        }),
    ]);

    const { data: createdPlans } = createdPlansResult;
    const { data: joinedPlans } = joinedPlansResult;

    // Combine and deduplicate
    const planMap = new Map();
    createdPlans?.forEach((plan) => {
      if (!planMap.has(plan.id)) {
        planMap.set(plan.id, plan);
      }
    });
    joinedPlans?.forEach((plan) => {
      if (!planMap.has(plan.id)) {
        planMap.set(plan.id, plan);
      }
    });

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
}
