import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import DashboardCardSkeleton from '../dashboard-card-skeleton';
import MiraInsightsDock from './mira-insights-dock';

interface DashboardInsightsProps {
  wsId: string;
  userId: string;
}

async function CompactTasksSummarySlot({
  userId,
  wsId,
}: DashboardInsightsProps) {
  const { default: CompactTasksSummary } = await import(
    './compact-tasks-summary'
  );

  return <CompactTasksSummary wsId={wsId} userId={userId} />;
}

async function CompactCalendarSummarySlot({ wsId }: { wsId: string }) {
  const { default: CompactCalendarSummary } = await import(
    './compact-calendar-summary'
  );

  return <CompactCalendarSummary wsId={wsId} />;
}

export default async function DashboardInsights({
  wsId,
  userId,
}: DashboardInsightsProps) {
  const t = await getTranslations('dashboard');

  return (
    <MiraInsightsDock
      tasksLabel={t('compact_tasks_title')}
      calendarLabel={t('compact_calendar_title')}
      tasksContent={
        <Suspense fallback={<DashboardCardSkeleton />}>
          <CompactTasksSummarySlot wsId={wsId} userId={userId} />
        </Suspense>
      }
      calendarContent={
        <Suspense fallback={<DashboardCardSkeleton />}>
          <CompactCalendarSummarySlot wsId={wsId} />
        </Suspense>
      }
    />
  );
}
