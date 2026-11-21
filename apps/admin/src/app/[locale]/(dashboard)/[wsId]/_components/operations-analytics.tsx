import { Activity, Building2, Lock, TrendingUp, Users } from '@tuturuuu/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import {
  getActionFrequencyByHour,
  getActivityHeatmap,
  getAuthProviderStats,
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
  getUserRegistrationData,
  getWorkspaceMemberDistribution,
  getWorkspaceStatistics,
} from '../data-fetching';
import AuditLogInsightsComponent from './audit-log-insights';
import AuthProviderStatsComponent from './auth-provider-stats';
import EngagementCharts from './engagement-charts';
import FeatureAdoptionComponent from './feature-adoption';
import PowerUsersComponent from './power-users';
import SessionAnalyticsComponent from './session-analytics';
import UserCohortsComponent from './user-cohorts';
import UserRegistrationChart from './user-registration-chart';
import WorkspaceAnalyticsComponent from './workspace-analytics';

/**
 * Detailed platform analytics tabs, unchanged from the previous overview and
 * now hosted inside the Operations view.
 */
export default async function OperationsAnalytics() {
  const t = await getTranslations();

  return (
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
