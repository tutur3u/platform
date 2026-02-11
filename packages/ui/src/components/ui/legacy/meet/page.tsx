import { Calendar, UserIcon, Users, Video, Zap } from '@tuturuuu/icons';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { GradientHeadline } from '@tuturuuu/ui/custom/gradient-headline';
import { Separator } from '@tuturuuu/ui/separator';
import 'dayjs/locale/vi';
import 'dayjs/plugin/relativeTime';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { MeetTogetherClient } from './client-wrapper';
import Form from './form';

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
  path?: string;
  searchParams?: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
  }>;
}

export async function MeetTogetherPage({
  wsId,
  path,
  searchParams,
}: MeetTogetherPageProps) {
  const locale = await getLocale();
  const t = await getTranslations('meet-together');
  const tCommon = await getTranslations('common');

  const resolvedSearchParams = await searchParams;
  const page = parseInt(resolvedSearchParams?.page || '1', 10);
  const pageSize = parseInt(resolvedSearchParams?.pageSize || '9', 10);

  const {
    data: plans,
    user,
    totalCount,
  } = await getData({ wsId, page, pageSize });
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="relative flex w-full flex-col items-center overflow-hidden">
      {/* Background decorative elements */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-20 -left-32 h-64 w-64 rounded-full bg-dynamic-blue/10 blur-3xl"></div>
        <div className="absolute top-32 -right-32 h-64 w-64 rounded-full bg-dynamic-purple/10 blur-3xl"></div>
        <div className="absolute bottom-1/3 left-1/4 h-40 w-40 rounded-full bg-dynamic-green/5 blur-2xl"></div>
      </div>

      {/* Hero + Form side-by-side on desktop, stacked on mobile */}
      <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-8 px-4 py-10 lg:flex-row lg:items-center lg:gap-12">
        {/* Hero section */}
        <div className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-left">
          {/* Badge */}
          <Badge variant="secondary" className="mb-6 px-4 py-2">
            <Video className="mr-2 h-4 w-4" />
            {t('meeting_coordination')}
          </Badge>

          {/* Main heading */}
          <h1 className="mb-6 text-balance text-center font-bold text-4xl text-foreground leading-tight tracking-tight md:text-5xl lg:text-left lg:text-6xl">
            {t('headline-p1')}{' '}
            <GradientHeadline className="bg-linear-to-r from-dynamic-blue via-dynamic-purple to-dynamic-green bg-clip-text">
              {t('headline-p2')}
            </GradientHeadline>
          </h1>

          {/* Subtitle */}
          <p className="mb-8 max-w-2xl text-center text-foreground/70 text-lg leading-relaxed md:text-xl lg:text-left">
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
        {/* Form section */}
        <div className="mx-auto w-full max-w-2xl flex-1 lg:mx-0">
          <Card className="border-border/50 bg-accent/50 backdrop-blur-sm">
            <CardContent className="p-6 md:p-8">
              <Form
                wsId={wsId}
                user={
                  user
                    ? {
                        id: user.id,
                        avatar_url: user.user_metadata?.avatar_url ?? null,
                        bio: user.user_metadata?.bio ?? null,
                        created_at: user.created_at ?? null,
                        deleted: user.user_metadata?.deleted ?? null,
                        display_name: user.user_metadata?.display_name ?? null,
                        handle: user.user_metadata?.handle ?? null,
                        services: user.user_metadata?.services ?? [],
                      }
                    : null
                }
              />
            </CardContent>
          </Card>
        </div>
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
              user={user}
              path={path}
            />
          ) : (
            <Card className="border-border/50 bg-linear-to-br from-dynamic-blue/5 to-dynamic-purple/5">
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
}: {
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
    joinedPlansQuery.eq('ws_id', wsId);
  }

  const [createdPlansResult, joinedPlansResult] = await Promise.all([
    createdPlansQuery,
    joinedPlansQuery,
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
