import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import DashboardCardSkeleton from '../dashboard-card-skeleton';
import CompactCalendarSummary from './compact-calendar-summary';
import CompactTasksSummary from './compact-tasks-summary';
import MiraInsightsDock from './mira-insights-dock';

interface DashboardInsightsProps {
  wsId: string;
  userId: string;
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
          <CompactTasksSummary wsId={wsId} userId={userId} />
        </Suspense>
      }
      calendarContent={
        <Suspense fallback={<DashboardCardSkeleton />}>
          <CompactCalendarSummary wsId={wsId} />
        </Suspense>
      }
    />
  );
}
