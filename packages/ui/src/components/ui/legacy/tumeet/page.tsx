import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import dayjs from 'dayjs';
import { Suspense } from 'react';
import Form from './form';
import MeetTogetherPagination from './pagination';
import UserTime from './user-time';
import 'dayjs/locale/vi';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { GradientHeadline } from '../../custom/gradient-headline';

// Extended interface to include participants
interface MeetTogetherPlanWithParticipants extends MeetTogetherPlan {
  participants?: Array<{
    user_id: string;
    display_name: string | null;
    is_guest: boolean;
    timeblock_count: number;
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

// Loading skeleton component for plans
function PlansLoadingSkeleton() {
  return (
    <div className="mt-4 grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => i).map((index) => (
        <div
          key={`skeleton-${Date.now()}-${index}`}
          className="rounded-lg border border-foreground/20 p-4"
        >
          <div className="mb-4 flex w-full items-center justify-between gap-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-16" />
          </div>
          <Skeleton className="mb-2 h-4 w-full" />
          <Skeleton className="mb-4 h-4 w-2/3" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Plans grid component
function PlansGrid({
  plans,
  locale,
  t,
}: {
  plans: MeetTogetherPlanWithParticipants[];
  locale: string;
  // biome-ignore lint/suspicious/noExplicitAny: <translations are not typed>
  t: any;
}) {
  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="mb-4 rounded-full bg-foreground/10 p-6">
          <svg
            className="h-8 w-8 text-foreground/60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <title>Calendar icon</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h3 className="mb-2 font-semibold text-foreground text-lg">
          {t('no_plans_yet')}
        </h3>
        <p className="max-w-md text-center text-foreground/60 text-sm">
          {t('new_plan_desc')}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan: MeetTogetherPlanWithParticipants) => (
        <Link
          href={`/meet-together/plans/${plan.id?.replace(/-/g, '')}`}
          key={plan.id}
          className="group grid w-full rounded-lg border border-foreground/20 p-4 transition-all duration-200 hover:border-foreground/40 hover:shadow-md"
        >
          <div className="flex w-full items-center justify-between gap-2">
            <h3 className="line-clamp-1 w-full flex-1 font-bold text-foreground">
              {plan.name || t('untitled_plan')}
            </h3>
            {plan.start_time && (
              <div className="rounded bg-foreground px-2 py-0.5 font-semibold text-background text-sm">
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
              <p className="line-clamp-2 text-foreground/70 text-sm">
                {plan.description}
              </p>
            )}

            {plan.start_time && plan.end_time && (
              <div className="text-foreground/60 transition-colors group-hover:text-foreground/80">
                <span className="font-semibold">
                  <UserTime time={plan.start_time} /> -{' '}
                  <UserTime time={plan.end_time} />
                </span>{' '}
                <span className="text-xs">({t('local_time')})</span>
              </div>
            )}
          </div>

          {plan.participants && plan.participants.length > 0 && (
            <>
              <Separator className="my-3" />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 text-dynamic-blue"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <title>Users icon</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m18-7a4 4 0 11-8 0 4 4 0 018 0zM9 7a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                  <span className="font-medium text-foreground text-sm">
                    {t('participants')}
                  </span>
                  <span className="rounded-full bg-dynamic-blue/10 px-2 py-0.5 font-medium text-dynamic-blue text-xs">
                    {plan.participants.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {plan.participants.slice(0, 3).map((participant) => (
                    <div
                      key={participant.user_id}
                      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors group-hover:bg-foreground/20 ${
                        participant.is_guest
                          ? 'bg-dynamic-orange/10 text-dynamic-orange'
                          : 'bg-dynamic-green/10 text-dynamic-green'
                      }`}
                    >
                      <div
                        className={`h-1.5 w-1.5 rounded-full ${
                          participant.is_guest
                            ? 'bg-dynamic-orange'
                            : 'bg-dynamic-green'
                        }`}
                      />
                      <span className="font-medium">
                        {participant.display_name || t('anonymous')}
                      </span>
                    </div>
                  ))}
                  {plan.participants.length > 3 && (
                    <div className="inline-flex items-center gap-1 rounded bg-foreground/10 px-2 py-1 text-foreground/70 text-xs group-hover:bg-foreground/20">
                      +{plan.participants.length - 3}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {plan.dates && plan.dates.length > 0 && (
            <>
              <Separator className="my-3" />
              <div className="flex h-full flex-wrap gap-2 text-center">
                {plan.dates?.slice(0, 5).map((date) => (
                  <div
                    key={date}
                    className={`flex items-center justify-center rounded bg-foreground/10 px-2 py-1 font-medium text-xs transition-colors group-hover:bg-foreground/20 ${(plan.dates?.length || 0) <= 2 && 'w-full'}`}
                  >
                    {dayjs(date)
                      .locale(locale)
                      .format(
                        `${locale === 'vi' ? 'DD/MM (ddd)' : 'MMM D (ddd)'}`
                      )}
                  </div>
                ))}
                {plan.dates.length > 5 && (
                  <div className="flex items-center justify-center rounded bg-foreground/10 px-2 py-1 font-medium text-xs group-hover:bg-foreground/20">
                    +{plan.dates.length - 5}
                  </div>
                )}
              </div>
            </>
          )}
        </Link>
      ))}
    </div>
  );
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
    <div className="flex w-full flex-col items-center">
      <div className="container mx-auto mt-8 flex max-w-4xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
        <div className="flex flex-col items-center">
          <h1 className="mx-auto mb-2 text-balance text-center font-bold text-2xl text-foreground leading-tight! tracking-tight md:text-4xl lg:text-6xl">
            {t('headline-p1')}{' '}
            <GradientHeadline>{t('headline-p2')}</GradientHeadline>.
          </h1>
        </div>
      </div>

      <div className="w-full max-w-4xl px-4">
        <Form wsId={wsId} />
      </div>

      <Separator className="mt-8 mb-6 md:mt-16" />

      <div className="flex w-full flex-col items-center justify-center p-4 pb-8 text-foreground">
        <div className="w-full max-w-4xl">
          <div className="mb-6 flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-bold text-2xl">{t('your_plans')}</h2>

              {totalCount > 0 && (
                <div className="text-foreground/60 text-sm">
                  <span className="font-medium text-foreground">
                    {totalCount}
                  </span>{' '}
                  {tCommon('result(s)')}
                </div>
              )}
            </div>
          </div>

          {user?.id ? (
            <>
              <Suspense fallback={<PlansLoadingSkeleton />}>
                <PlansGrid plans={plans} locale={locale} t={t} />
              </Suspense>

              {totalPages > 1 && (
                <div className="mt-8 flex justify-center">
                  <MeetTogetherPagination
                    currentPage={page}
                    totalPages={totalPages}
                    totalCount={totalCount}
                    pageSize={pageSize}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-4 rounded-full bg-foreground/10 p-6">
                <svg
                  className="h-8 w-8 text-foreground/60"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <title>User icon</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <h3 className="mb-2 font-semibold text-foreground text-lg">
                {t('login_to_save_plans')}
              </h3>
              <p className="max-w-md text-center text-foreground/60 text-sm">
                {t('new_plan_desc')}
              </p>
            </div>
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

  // Get all plans (both created and joined) first
  const createdPlansQuery = sbAdmin
    .from('meet_together_plans')
    .select('*')
    .eq('creator_id', user.id)
    .order('created_at', { ascending: false });

  const joinedPlansQuery = sbAdmin
    .from('meet_together_user_timeblocks')
    .select('...meet_together_plans!inner(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (wsId) {
    createdPlansQuery.eq('ws_id', wsId);
    joinedPlansQuery.eq('meet_together_plans.ws_id', wsId);
  }

  const [createdPlans, joinedPlans] = await Promise.all([
    createdPlansQuery,
    joinedPlansQuery,
  ]);

  const { data: createdPlanData, error: createdPlansError } = createdPlans;
  const { data: joinedPlanData, error: joinedPlansError } = joinedPlans;

  if (createdPlansError) throw createdPlansError;
  if (joinedPlansError) throw joinedPlansError;

  // Combine and deduplicate all plans
  let allPlans = [...(createdPlanData || []), ...(joinedPlanData || [])]
    .filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i)
    .sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
    );

  // Apply search filter if provided
  if (search) {
    const searchLower = search.toLowerCase();
    allPlans = allPlans.filter(
      (plan) =>
        plan.name?.toLowerCase().includes(searchLower) ||
        plan.description?.toLowerCase().includes(searchLower)
    );
  }

  const totalCount = allPlans.length;

  // Apply pagination in memory
  const from = (page - 1) * pageSize;
  const to = from + pageSize;
  const paginatedPlans = allPlans.slice(from, to);

  // Fetch participants for each plan
  const planIds = paginatedPlans.map((plan) => plan.id).filter(Boolean);

  if (planIds.length > 0) {
    const { data: participantsData } = await sbAdmin
      .from('meet_together_users')
      .select('user_id, display_name, plan_id, is_guest, timeblock_count')
      .in('plan_id', planIds);

    // Add participants to each plan
    const plansWithParticipants = paginatedPlans.map((plan) => ({
      ...plan,
      participants:
        participantsData?.filter((p) => p.plan_id === plan.id) || [],
    }));

    return {
      data: plansWithParticipants as MeetTogetherPlanWithParticipants[],
      user,
      totalCount,
    };
  }

  return {
    data: paginatedPlans.map((plan) => ({
      ...plan,
      participants: [],
    })) as MeetTogetherPlanWithParticipants[],
    user,
    totalCount,
  };
}
