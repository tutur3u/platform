import { Activity, Building2, Lock, TrendingUp, Users } from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { enforceRootWorkspaceAdmin } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import AuditLogInsightsComponent from './_components/audit-log-insights';
import AuthProviderStatsComponent from './_components/auth-provider-stats';
import EngagementCharts from './_components/engagement-charts';
import FeatureAdoptionComponent from './_components/feature-adoption';
import MetricCards, { Server } from './_components/metric-cards';
import PowerUsersComponent from './_components/power-users';
import SessionAnalyticsComponent from './_components/session-analytics';
import UserCohortsComponent from './_components/user-cohorts';
import UserRegistrationChart from './_components/user-registration-chart';
import WorkspaceAnalyticsComponent from './_components/workspace-analytics';
import {
  getActionFrequencyByHour,
  getActivityHeatmap,
  getAuthProviderStats,
  getEngagementMetrics,
  getEngagementMetricsOverTime,
  getFeatureAdoption,
  getPowerUsers,
  getRecentActionsSummary,
  getRecentAuditLogs,
  getRetentionRate,
  getSessionStatistics,
  getSessionsByDevice,
  getSignInsByProvider,
  getUserActivityCohorts,
  getUserGrowthComparison,
  getUserRegistrationData,
  getWorkspaceMemberDistribution,
  getWorkspaceStatistics,
} from './data-fetching';

export const metadata: Metadata = {
  title: 'Infrastructure',
  description:
    'Manage Infrastructure in the Workspace Settings area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function InfrastructureOverviewPage({ params }: Props) {
  const { wsId } = await params;
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  const t = await getTranslations();

  // Fetch key metrics in parallel for the header
  const [engagementMetrics, userGrowth, workspaceStats, sessionStats] =
    await Promise.all([
      getEngagementMetrics(),
      getUserGrowthComparison(),
      getWorkspaceStatistics(),
      getSessionStatistics(),
    ]);

  // Prepare metric cards data
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
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4">
        <div>
          <h1 className="font-bold text-2xl">
            {t('workspace-settings-layout.infrastructure')}
          </h1>
          <p className="text-foreground/80">
            {t('infrastructure-analytics.page-description')}
          </p>
        </div>
      </div>

      <Separator className="my-4" />

      {/* Key Metrics Cards */}
      <MetricCards metrics={metricCardsData} />

      <Separator className="my-4" />

      {/* Tabbed Analytics Sections */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5">
          <TabsTrigger value="overview" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            {t('infrastructure-analytics.tabs.overview')}
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            {t('infrastructure-analytics.tabs.users')}
          </TabsTrigger>
          <TabsTrigger value="auth" className="gap-2">
            <Lock className="h-4 w-4" />
            {t('infrastructure-analytics.tabs.authentication')}
          </TabsTrigger>
          <TabsTrigger value="workspaces" className="gap-2">
            <Building2 className="h-4 w-4" />
            {t('infrastructure-analytics.tabs.workspaces')}
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="h-4 w-4" />
            {t('infrastructure-analytics.tabs.activity')}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <Suspense fallback={<LoadingSkeleton />}>
            <OverviewContent />
          </Suspense>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-6">
          <Suspense fallback={<LoadingSkeleton />}>
            <UsersContent />
          </Suspense>
        </TabsContent>

        {/* Authentication Tab */}
        <TabsContent value="auth" className="space-y-6">
          <Suspense fallback={<LoadingSkeleton />}>
            <AuthenticationContent />
          </Suspense>
        </TabsContent>

        {/* Workspaces Tab */}
        <TabsContent value="workspaces" className="space-y-6">
          <Suspense fallback={<LoadingSkeleton />}>
            <WorkspacesContent />
          </Suspense>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-6">
          <Suspense fallback={<LoadingSkeleton />}>
            <ActivityContent />
          </Suspense>
        </TabsContent>
      </Tabs>
    </>
  );
}

async function OverviewContent() {
  const [engagementData, heatmapData] = await Promise.all([
    getEngagementMetricsOverTime(90),
    getActivityHeatmap(),
  ]);

  return (
    <div className="rounded-lg border border-border bg-foreground/5 p-6">
      <EngagementCharts data={engagementData} heatmapData={heatmapData} />
    </div>
  );
}

async function UsersContent() {
  const [registrationData, cohorts, retentionData, powerUsers] =
    await Promise.all([
      getUserRegistrationData(),
      getUserActivityCohorts(),
      getRetentionRate('weekly'),
      getPowerUsers(5),
    ]);

  return (
    <>
      <div className="rounded-lg border border-border bg-foreground/5 p-6">
        <UserRegistrationChart data={registrationData} />
      </div>
      <div className="rounded-lg border border-border bg-foreground/5 p-6">
        <UserCohortsComponent cohorts={cohorts} retentionData={retentionData} />
      </div>
      <div className="rounded-lg border border-border bg-foreground/5 p-6">
        <PowerUsersComponent users={powerUsers} />
      </div>
    </>
  );
}

async function AuthenticationContent() {
  const [providerStats, signInsData, sessionStats, deviceStats] =
    await Promise.all([
      getAuthProviderStats(),
      getSignInsByProvider(30),
      getSessionStatistics(),
      getSessionsByDevice(),
    ]);

  return (
    <>
      <div className="rounded-lg border border-border bg-foreground/5 p-6">
        <AuthProviderStatsComponent
          providerStats={providerStats}
          signInsByProvider={signInsData}
        />
      </div>
      <div className="rounded-lg border border-border bg-foreground/5 p-6">
        <SessionAnalyticsComponent
          statistics={sessionStats}
          deviceStats={deviceStats}
        />
      </div>
    </>
  );
}

async function WorkspacesContent() {
  const [statistics, distribution] = await Promise.all([
    getWorkspaceStatistics(),
    getWorkspaceMemberDistribution(),
  ]);

  return (
    <div className="rounded-lg border border-border bg-foreground/5 p-6">
      <WorkspaceAnalyticsComponent
        statistics={statistics}
        distribution={distribution}
      />
    </div>
  );
}

async function ActivityContent() {
  const [actionsSummary, frequencyByHour, recentLogs, featureAdoption] =
    await Promise.all([
      getRecentActionsSummary(50),
      getActionFrequencyByHour(),
      getRecentAuditLogs(50),
      getFeatureAdoption('workspace:'),
    ]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-foreground/5 p-6">
        <AuditLogInsightsComponent
          actionsSummary={actionsSummary}
          frequencyByHour={frequencyByHour}
          recentLogs={recentLogs}
        />
      </div>
      {featureAdoption.length > 0 && (
        <div className="rounded-lg border border-border bg-foreground/5 p-6">
          <FeatureAdoptionComponent features={featureAdoption} />
        </div>
      )}
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
