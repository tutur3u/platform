import { Activity, TrendingUp, Users } from '@tuturuuu/icons';
import { OpsPageHeader } from '@tuturuuu/ui/custom/ops';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import ExecutiveView from './_components/executive-view';
import MetricCards, { Server } from './_components/metric-cards';
import OperationsAnalytics from './_components/operations-analytics';
import OperationsDrilldown from './_components/operations-drilldown';
import OverviewViewSwitcher, {
  parseOverviewView,
} from './_components/overview-view-switcher';
import {
  getEngagementMetrics,
  getSessionStatistics,
  getUserGrowthComparison,
  getWorkspaceStatistics,
} from './data-fetching';
import { enforceInfrastructureRootWorkspace } from './enforce-infrastructure-root';
import { loadExecutiveSnapshot } from './executive-data';

export const metadata: Metadata = {
  title: 'Infrastructure',
  description:
    'Manage Infrastructure in the Workspace Settings area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{ view?: string | string[] }>;
}

export default async function InfrastructureOverviewPage({
  params,
  searchParams,
}: Props) {
  await connection();

  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);

  const t = await getTranslations();
  const view = parseOverviewView((await searchParams).view);

  return (
    <>
      <OpsPageHeader
        description={t('infrastructure-analytics.page-description')}
        title={t('workspace-settings-layout.infrastructure')}
      />

      <Separator className="my-4" />

      <OverviewViewSwitcher view={view} wsId={wsId} />

      <div className="mt-6">
        {view === 'executive' ? (
          <Suspense fallback={<LoadingSkeleton />}>
            <ExecutiveContent wsId={wsId} />
          </Suspense>
        ) : (
          <Suspense fallback={<LoadingSkeleton />}>
            <OperationsContent wsId={wsId} />
          </Suspense>
        )}
      </div>
    </>
  );
}

async function ExecutiveContent({ wsId }: { wsId: string }) {
  const snapshot = await loadExecutiveSnapshot();
  return <ExecutiveView snapshot={snapshot} wsId={wsId} />;
}

async function OperationsContent({ wsId }: { wsId: string }) {
  const t = await getTranslations();

  // Existing header metrics, preserved for the operations view.
  const [engagementMetrics, userGrowth, workspaceStats, sessionStats] =
    await Promise.all([
      getEngagementMetrics(),
      getUserGrowthComparison(),
      getWorkspaceStatistics(),
      getSessionStatistics(),
    ]);

  const metricCardsData = [
    {
      title: t('infrastructure-analytics.metrics.total-users'),
      value: userGrowth.total_users,
      change: userGrowth.growth_rate_weekly ?? undefined,
      changeLabel: t('infrastructure-analytics.metrics.vs-last-week'),
      trend:
        userGrowth.growth_rate_weekly === null
          ? ('stable' as const)
          : userGrowth.growth_rate_weekly > 0
            ? ('up' as const)
            : ('down' as const),
      icon: <Users className="h-5 w-5 text-primary" />,
    },
    {
      title: t('infrastructure-analytics.metrics.active-sessions'),
      value: sessionStats.active_sessions,
      icon: <Activity className="h-5 w-5 text-primary" />,
    },
    {
      title: t('infrastructure-analytics.metrics.workspaces'),
      value: workspaceStats.active_workspaces,
      icon: <Server className="h-5 w-5 text-primary" />,
    },
    {
      title: t('infrastructure-analytics.metrics.dau'),
      value: engagementMetrics.dau,
      icon: <TrendingUp className="h-5 w-5 text-primary" />,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeading
          description={t(
            'infrastructure-analytics.operations.drilldown-description'
          )}
          title={t('infrastructure-analytics.operations.drilldown-title')}
        />
        <OperationsDrilldown wsId={wsId} />
      </section>

      <section className="space-y-3">
        <SectionHeading
          description={t(
            'infrastructure-analytics.operations.analytics-description'
          )}
          title={t('infrastructure-analytics.operations.analytics-title')}
        />
        <MetricCards metrics={metricCardsData} />
        <OperationsAnalytics />
      </section>
    </div>
  );
}

function SectionHeading({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div>
      <h2 className="font-semibold text-lg">{title}</h2>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-foreground/5 p-6">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-full animate-pulse rounded bg-muted" />
      <div className="h-64 w-full animate-pulse rounded bg-muted" />
    </div>
  );
}
