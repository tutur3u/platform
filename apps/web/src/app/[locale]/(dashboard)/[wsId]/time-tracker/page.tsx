import { createClient } from '@tuturuuu/supabase/next/server';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { HeatmapCardClient } from './components/heatmap-card-client';
import OverviewTimer from './components/overview-timer';
import { StatsCardClient } from './components/stats-card-client';
import type { SessionWithRelations } from './types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('time-tracker');

  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
  };
}

async function fetchTimerData(userId: string, wsId: string) {
  const sbAdmin = await createClient();

  const [categoriesResult, runningSessionResult] = await Promise.all([
    sbAdmin.from('time_tracking_categories').select('*').eq('ws_id', wsId),
    sbAdmin
      .from('time_tracking_sessions')
      .select('*, category:time_tracking_categories(*), task:tasks(*)')
      .eq('ws_id', wsId)
      .eq('user_id', userId)
      .is('duration_seconds', null)
      .single(),
  ]);

  // Handle categories result
  let categories: typeof categoriesResult.data = [];
  if (categoriesResult.error) {
    if (categoriesResult.error.code !== 'PGRST116') {
      console.error(
        '[time-tracker] Error fetching categories:',
        categoriesResult.error.code,
        categoriesResult.error.message
      );
    }
  } else if (categoriesResult.data) {
    categories = categoriesResult.data;
  }

  // Handle running session result
  let runningSession: SessionWithRelations | null = null;
  if (runningSessionResult.error) {
    if (runningSessionResult.error.code !== 'PGRST116') {
      console.error(
        '[time-tracker] Error fetching running session:',
        runningSessionResult.error.code,
        runningSessionResult.error.message
      );
    }
  } else if (runningSessionResult.data) {
    runningSession = runningSessionResult.data as SessionWithRelations;
  }

  return {
    categories,
    runningSession,
  };
}

// Stats card skeleton
function StatsCardSkeleton() {
  return (
    <Card>
      <div className="flex items-center gap-3 p-6">
        <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function HeatmapCardSkeleton() {
  return (
    <Card className="relative overflow-x-auto">
      <div className="flex items-center gap-3 p-6">
        <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-56 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <CardContent>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </CardContent>
    </Card>
  );
}

function TimerCardSkeleton() {
  return (
    <Card>
      <div className="flex items-center justify-between p-6 pb-3">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-4 w-48 animate-pulse rounded bg-muted px-6" />
      <CardContent className="space-y-3">
        <div className="h-10 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-10 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-10 w-32 animate-pulse rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

export default async function TimeTrackerPage({
  params,
}: {
  params: Promise<{ locale: string; wsId: string }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ workspace, wsId, locale, isPersonal }) => {
        const user = await getCurrentSupabaseUser();
        if (!user) return notFound();

        // Fetch timer data
        const timerDataPromise = fetchTimerData(user.id, wsId);

        return (
          <div className="grid gap-4 pb-4">
            {/* Stats */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Stats Card - Client Component with timezone detection */}
              <Suspense fallback={<StatsCardSkeleton />}>
                <StatsCardClient
                  wsId={wsId}
                  userId={user.id}
                  isPersonal={isPersonal}
                  locale={locale}
                  workspace={workspace}
                />
              </Suspense>

              {/* Quick Timer */}
              <Suspense fallback={<TimerCardSkeleton />}>
                <TimerCardWrapper
                  timerDataPromise={timerDataPromise}
                  wsId={wsId}
                  userId={user.id}
                  workspace={workspace}
                />
              </Suspense>
            </div>

            {/* Heatmap */}
            <Suspense fallback={<HeatmapCardSkeleton />}>
              <HeatmapCardClient
                wsId={wsId}
                userId={user.id}
                isPersonal={isPersonal}
              />
            </Suspense>
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}

// Timer wrapper component
async function TimerCardWrapper({
  timerDataPromise,
  wsId,
  userId,
  workspace,
}: {
  timerDataPromise: Promise<Awaited<ReturnType<typeof fetchTimerData>>>;
  wsId: string;
  userId: string;
  workspace: NonNullable<
    Awaited<
      ReturnType<typeof import('@tuturuuu/utils/workspace-helper').getWorkspace>
    >
  >;
}) {
  const timerData = await timerDataPromise;
  return (
    <OverviewTimer
      wsId={wsId}
      userId={userId}
      categories={timerData.categories}
      initialRunningSession={timerData.runningSession}
      workspace={workspace}
    />
  );
}
