import LoadingStatisticCard from '@/components/loading-statistic-card';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { AuroraForecast } from '@tuturuuu/types/db';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import UpcomingCalendarEvents from './calendar/upcoming-events';
import DashboardCardSkeleton from './dashboard-card-skeleton';
import NewlyCreatedTasks from './tasks/newly-created-tasks';
import TasksAssignedToMe from './tasks/tasks-assigned-to-me';
import TimeTrackingMetrics from './time-tracker/time-tracking-metrics';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceHomePage({ params }: Props) {
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  const currentUser = await getCurrentUser();
  const forecast = await getForecast();
  const mlMetrics = await getMLMetrics();
  const statsMetrics = await getStatsMetrics();

  if (!workspace) notFound();

  if (!forecast || !mlMetrics || !statsMetrics) {
    return <LoadingStatisticCard />;
  }

  const wsId = workspace?.id;

  return (
    <>
      {currentUser && (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <Suspense fallback={<DashboardCardSkeleton />}>
            <NewlyCreatedTasks wsId={wsId} />
          </Suspense>

          <Suspense fallback={<DashboardCardSkeleton />}>
            <TasksAssignedToMe wsId={wsId} userId={currentUser.id} />
          </Suspense>

          <Suspense fallback={<DashboardCardSkeleton />}>
            <UpcomingCalendarEvents wsId={wsId} />
          </Suspense>

          <Suspense fallback={<DashboardCardSkeleton />}>
            <TimeTrackingMetrics wsId={wsId} userId={currentUser.id} />
          </Suspense>
        </div>
      )}
    </>
  );
}

async function getForecast() {
  const supabase = await createClient();

  const { data: statistical_forecast, error: statError } = await supabase
    .from('aurora_statistical_forecast')
    .select('*')
    .order('date', { ascending: true });

  if (statError) throw new Error('Error fetching statistical forecast');

  const { data: ml_forecast, error: mlError } = await supabase
    .from('aurora_ml_forecast')
    .select('*')
    .order('date', { ascending: true });

  if (mlError) throw new Error('Error fetching ML forecast');

  return {
    statistical_forecast: statistical_forecast?.map((item) => ({
      ...item,
      date: new Date(item.date).toISOString().split('T')[0],
    })),
    ml_forecast: ml_forecast?.map((item) => ({
      ...item,
      date: new Date(item.date).toISOString().split('T')[0],
    })),
  } as AuroraForecast;
}

async function getMLMetrics() {
  const supabase = await createClient();

  const { data } = await supabase.from('aurora_ml_metrics').select('*');

  return data;
}

async function getStatsMetrics() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('aurora_statistical_metrics')
    .select('*');

  return data;
}
