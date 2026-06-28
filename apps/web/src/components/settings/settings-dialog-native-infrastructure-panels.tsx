'use client';

import { useQuery } from '@tanstack/react-query';
import { DEFAULT_APP_COORDINATION_SESSION_POLICY } from '@tuturuuu/auth/app-session-policy';
import {
  type GitHubBotState,
  getCalendarSyncSettingsSnapshot,
  getDevboxSettingsSnapshot,
  getEmailAuditSettingsSnapshot,
  getEntityCreationLimitsSettingsSnapshot,
  getMobileVersionPolicies,
  getPushNotificationsSettingsSnapshot,
  type MobileDeploymentState,
  type PushNotificationsSettingsSnapshot,
} from '@tuturuuu/internal-api/infrastructure';
import { AbuseIntelligenceClient } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/abuse-intelligence/abuse-intelligence-client';
import { AiAgentsClient } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/ai-agents/ai-agents-client';
import AiCreditsPage from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/ai-credits/page';
import { AppCoordinationClient } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/app-coordination/app-coordination-client';
import { AuthRecoveryClient } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/auth-recovery/auth-recovery-client';
import TemplatePreview from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/email-templates/template-preview';
import EntityCreationLimitsClient from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/entity-creation-limits/client';
import type {
  AvailableTableRow,
  TableGroup,
} from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/entity-creation-limits/types';
import { ExternalAppsClient } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/external-apps/external-apps-client';
import { GitHubBotClient } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/github-bot/github-bot-client';
import { MobileDeploymentClient } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/mobile-deployment/mobile-deployment-client';
import { MobileVersionSettingsForm } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/mobile-versions/mobile-version-settings-form';
import { BlueGreenMonitoringWatcherLogsClient } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/monitoring/_components/blue-green-monitoring-watcher-logs-client';
import { InfrastructureStressTestsClient } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/monitoring/_components/infrastructure-stress-tests-client';
import { ObservabilityDashboardClient } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/monitoring/_components/observability-dashboard-client';
import OtpLimitResetClient from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/otp-limits/client';
import { PushTestForm } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/push-notifications/push-test-form';
import { RateLimitAppealsClient } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/rate-limit-appeals/rate-limit-appeals-client';
import { RateLimitsClient } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/rate-limits/rate-limits-client';
import { RealtimeAnalyticsClient } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/infrastructure/realtime/_components/realtime-analytics-client';
import {
  NativeApiPreviewPanel,
  NativeMetricGrid,
  NativePanelError,
  NativePanelFrame,
  NativePanelLoading,
  NativeSimpleTable,
} from './settings-dialog-native-panel-utils';

interface NativeInfrastructurePanelProps {
  activeTab: string;
  wsId: string;
}

export const INFRASTRUCTURE_NATIVE_TABS = new Set([
  'infrastructure_abuse_events',
  'infrastructure_abuse_intelligence',
  'infrastructure_ai_agents',
  'infrastructure_ai_credits',
  'infrastructure_ai_whitelisted_domains',
  'infrastructure_ai_whitelisted_emails',
  'infrastructure_app_coordination',
  'infrastructure_auth_recovery',
  'infrastructure_blocked_ips',
  'infrastructure_calendar_sync',
  'infrastructure_changelog',
  'infrastructure_cron_whitelisted_domains',
  'infrastructure_devboxes',
  'infrastructure_email_audit',
  'infrastructure_email_blacklist',
  'infrastructure_email_templates',
  'infrastructure_entity_creation_limits',
  'infrastructure_external_apps',
  'infrastructure_github_bot',
  'infrastructure_mobile_deployment',
  'infrastructure_mobile_versions',
  'infrastructure_monitoring',
  'infrastructure_monitoring_analytics',
  'infrastructure_monitoring_cron',
  'infrastructure_monitoring_logs',
  'infrastructure_monitoring_observability',
  'infrastructure_monitoring_projects',
  'infrastructure_monitoring_requests',
  'infrastructure_monitoring_resources',
  'infrastructure_monitoring_rollouts',
  'infrastructure_monitoring_stress_tests',
  'infrastructure_monitoring_watcher_logs',
  'infrastructure_otp_limits',
  'infrastructure_overview',
  'infrastructure_post_email_queue',
  'infrastructure_push_notifications',
  'infrastructure_rate_limit_appeals',
  'infrastructure_rate_limits',
  'infrastructure_realtime',
  'infrastructure_timezones',
  'infrastructure_translations',
  'infrastructure_users',
  'infrastructure_workspaces',
]);

const EMPTY_GITHUB_BOT_STATE: GitHubBotState = {
  auditEvents: [],
  clients: [],
  configuration: null,
};

const EMPTY_MOBILE_DEPLOYMENT_STATE: MobileDeploymentState = {
  activeVersion: null,
  auditEvents: [],
  draftVersion: null,
  envKeys: [],
  fileArtifacts: [],
  scalarValues: [],
  tokens: [],
};

const OBSERVABILITY_MODE_BY_TAB = {
  infrastructure_monitoring: 'overview',
  infrastructure_monitoring_analytics: 'analytics',
  infrastructure_monitoring_cron: 'cron',
  infrastructure_monitoring_logs: 'logs',
  infrastructure_monitoring_observability: 'observability',
  infrastructure_monitoring_projects: 'projects',
  infrastructure_monitoring_requests: 'requests',
  infrastructure_monitoring_resources: 'resources',
  infrastructure_monitoring_rollouts: 'deployments',
} as const;

const API_PREVIEW_BY_TAB: Record<string, { columns: string[]; path: string }> =
  {
    infrastructure_abuse_events: {
      columns: ['created_at', 'event_type', 'ip_address', 'email'],
      path: '/api/v1/infrastructure/abuse-events?pageSize=25',
    },
    infrastructure_ai_whitelisted_domains: {
      columns: ['domain', 'enabled', 'created_at', 'updated_at'],
      path: '/api/v1/infrastructure/ai/whitelist/domains?pageSize=25',
    },
    infrastructure_ai_whitelisted_emails: {
      columns: ['email', 'enabled', 'created_at', 'updated_at'],
      path: '/api/v1/infrastructure/ai/whitelist/emails?pageSize=25',
    },
    infrastructure_blocked_ips: {
      columns: ['ip_address', 'reason', 'status', 'expires_at'],
      path: '/api/v1/infrastructure/blocked-ips?pageSize=25',
    },
    infrastructure_changelog: {
      columns: ['id', 'title', 'status', 'created_at'],
      path: '/api/v1/infrastructure/changelog?pageSize=25',
    },
    infrastructure_cron_whitelisted_domains: {
      columns: ['domain', 'enabled', 'description', 'updated_at'],
      path: '/api/v1/infrastructure/cron/whitelist/domains?pageSize=25',
    },
    infrastructure_email_blacklist: {
      columns: ['email', 'reason', 'created_at', 'updated_at'],
      path: '/api/v1/infrastructure/email-blacklist?pageSize=25',
    },
    infrastructure_post_email_queue: {
      columns: ['id', 'status', 'recipient_email', 'created_at'],
      path: '/api/v1/infrastructure/post-email-queue?pageSize=25',
    },
    infrastructure_timezones: {
      columns: ['id', 'name', 'offset', 'updated_at'],
      path: '/api/v1/infrastructure/timezones?pageSize=25',
    },
    infrastructure_translations: {
      columns: ['id', 'code', 'name', 'enabled'],
      path: '/api/v1/infrastructure/languages?pageSize=25',
    },
    infrastructure_users: {
      columns: ['id', 'display_name', 'email', 'created_at'],
      path: '/api/v1/infrastructure/users?pageSize=25',
    },
    infrastructure_workspaces: {
      columns: ['id', 'name', 'handle', 'created_at'],
      path: '/api/v1/workspaces?limit=25',
    },
  };

export function InfrastructureNativeSettingsPanels({
  activeTab,
  wsId,
}: NativeInfrastructurePanelProps) {
  if (!INFRASTRUCTURE_NATIVE_TABS.has(activeTab)) return null;

  return (
    <NativePanelFrame activeTab={activeTab}>
      <InfrastructureNativePanelBody activeTab={activeTab} wsId={wsId} />
    </NativePanelFrame>
  );
}

function InfrastructureNativePanelBody({
  activeTab,
  wsId,
}: NativeInfrastructurePanelProps) {
  if (activeTab === 'infrastructure_overview') {
    return <ObservabilityDashboardClient mode="overview" />;
  }
  if (activeTab === 'infrastructure_abuse_intelligence') {
    return <AbuseIntelligenceClient />;
  }
  if (activeTab === 'infrastructure_ai_agents') {
    return <AiAgentsClient initialData={{ agents: [], identities: [] }} />;
  }
  if (activeTab === 'infrastructure_ai_credits') return <AiCreditsPage />;
  if (activeTab === 'infrastructure_app_coordination') {
    return (
      <AppCoordinationClient
        initialPolicy={{
          policy: DEFAULT_APP_COORDINATION_SESSION_POLICY,
          source: 'default',
        }}
      />
    );
  }
  if (activeTab === 'infrastructure_auth_recovery') {
    return <AuthRecoveryClient canManage locale="en" />;
  }
  if (activeTab === 'infrastructure_external_apps') {
    return <ExternalAppsClient initialApps={[]} />;
  }
  if (activeTab === 'infrastructure_github_bot') {
    return (
      <GitHubBotClient
        initialData={EMPTY_GITHUB_BOT_STATE}
        tokenEndpointUrl="/api/v1/infrastructure/github-bot/installation-token"
      />
    );
  }
  if (activeTab === 'infrastructure_mobile_deployment') {
    return (
      <MobileDeploymentClient initialData={EMPTY_MOBILE_DEPLOYMENT_STATE} />
    );
  }
  if (activeTab === 'infrastructure_mobile_versions') {
    return <MobileVersionsNativePanel />;
  }
  if (activeTab === 'infrastructure_calendar_sync') {
    return <CalendarSyncNativePanel wsId={wsId} />;
  }
  if (activeTab === 'infrastructure_devboxes') {
    return <DevboxesNativePanel />;
  }
  if (activeTab === 'infrastructure_email_audit') {
    return <EmailAuditNativePanel wsId={wsId} />;
  }
  if (activeTab === 'infrastructure_email_templates') {
    return <TemplatePreview />;
  }
  if (activeTab === 'infrastructure_entity_creation_limits') {
    return <EntityCreationLimitsNativePanel wsId={wsId} />;
  }
  if (activeTab === 'infrastructure_monitoring_stress_tests') {
    return <InfrastructureStressTestsClient wsId={wsId} />;
  }
  if (activeTab === 'infrastructure_monitoring_watcher_logs') {
    return <BlueGreenMonitoringWatcherLogsClient />;
  }
  if (activeTab === 'infrastructure_otp_limits') {
    return (
      <div className="space-y-6">
        <OtpLimitResetClient />
        <NativeApiPreviewPanel
          columns={['created_at', 'actor_type', 'event_type']}
          path="/api/v1/infrastructure/abuse-events?pageSize=10"
          queryKey={['native-settings', activeTab, 'history']}
        />
      </div>
    );
  }
  if (activeTab === 'infrastructure_rate_limits') {
    return <RateLimitsClient canManage wsId={wsId} />;
  }
  if (activeTab === 'infrastructure_rate_limit_appeals') {
    return <RateLimitAppealsClient canManage wsId={wsId} />;
  }
  if (activeTab === 'infrastructure_realtime') {
    return <RealtimeAnalyticsClient wsId={wsId} />;
  }
  if (activeTab === 'infrastructure_push_notifications') {
    return <PushNotificationsNativePanel />;
  }

  const observabilityMode =
    OBSERVABILITY_MODE_BY_TAB[
      activeTab as keyof typeof OBSERVABILITY_MODE_BY_TAB
    ];
  if (observabilityMode) {
    return <ObservabilityDashboardClient mode={observabilityMode} />;
  }

  const apiPreview = API_PREVIEW_BY_TAB[activeTab];
  if (apiPreview) {
    return (
      <NativeApiPreviewPanel
        columns={apiPreview.columns}
        path={apiPreview.path}
        queryKey={['native-settings', activeTab]}
      />
    );
  }

  return null;
}

function CalendarSyncNativePanel({ wsId }: { wsId: string }) {
  const snapshotQuery = useQuery({
    queryFn: () => getCalendarSyncSettingsSnapshot(wsId),
    queryKey: ['native-settings', 'calendar-sync', wsId],
  });

  if (snapshotQuery.isPending) return <NativePanelLoading />;
  if (snapshotQuery.isError) {
    return <NativePanelError onRetry={() => snapshotQuery.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <NativeMetricGrid items={snapshotQuery.data.metrics} />
      <NativeSimpleTable
        columns={[
          'timestamp',
          'status',
          'type',
          'source',
          'user',
          'duration',
          'events',
        ]}
        rows={snapshotQuery.data.logs}
      />
    </div>
  );
}

function DevboxesNativePanel() {
  const snapshotQuery = useQuery({
    queryFn: () => getDevboxSettingsSnapshot(),
    queryKey: ['native-settings', 'devboxes'],
  });

  if (snapshotQuery.isPending) return <NativePanelLoading />;
  if (snapshotQuery.isError) {
    return <NativePanelError onRetry={() => snapshotQuery.refetch()} />;
  }

  const { metrics, runners, runs } = snapshotQuery.data;

  return (
    <div className="space-y-4">
      <NativeMetricGrid
        items={[
          { label: 'Active runners', value: metrics.activeRunners ?? 0 },
          { label: 'Active leases', value: metrics.activeLeases ?? 0 },
          { label: 'Queued runs', value: metrics.queuedRuns ?? 0 },
          { label: 'Running runs', value: metrics.runningRuns ?? 0 },
          { label: 'Failed runs', value: metrics.failedRuns ?? 0 },
          {
            label: 'Active runner tokens',
            value: metrics.activeRunnerTokens ?? 0,
          },
        ]}
      />
      <NativeSimpleTable
        columns={['name', 'status', 'last_heartbeat_at', 'updated_at']}
        rows={runners}
      />
      <NativeSimpleTable
        columns={['id', 'status', 'runner_id', 'created_at', 'updated_at']}
        rows={runs}
      />
    </div>
  );
}

function EmailAuditNativePanel({ wsId }: { wsId: string }) {
  const snapshotQuery = useQuery({
    queryFn: () => getEmailAuditSettingsSnapshot(wsId),
    queryKey: ['native-settings', 'email-audit', wsId],
  });

  if (snapshotQuery.isPending) return <NativePanelLoading />;
  if (snapshotQuery.isError) {
    return <NativePanelError onRetry={() => snapshotQuery.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <NativeMetricGrid
        items={[
          { label: 'Total emails', value: snapshotQuery.data.stats.total },
          { label: 'Sent emails', value: snapshotQuery.data.stats.sent },
          { label: 'Failed emails', value: snapshotQuery.data.stats.failed },
          {
            label: 'Rate limited',
            value: snapshotQuery.data.stats.rateLimited,
          },
        ]}
      />
      <NativeSimpleTable
        columns={[
          'created_at',
          'status',
          'provider',
          'template_type',
          'subject',
        ]}
        rows={snapshotQuery.data.data}
      />
    </div>
  );
}

function EntityCreationLimitsNativePanel({ wsId }: { wsId: string }) {
  const snapshotQuery = useQuery({
    queryFn: () => getEntityCreationLimitsSettingsSnapshot(),
    queryKey: ['native-settings', 'entity-creation-limits'],
  });

  if (snapshotQuery.isPending) return <NativePanelLoading />;
  if (snapshotQuery.isError) {
    return <NativePanelError onRetry={() => snapshotQuery.refetch()} />;
  }

  const tableGroups = snapshotQuery.data.tableGroups as unknown as TableGroup[];
  const availableTables = snapshotQuery.data
    .availableTables as unknown as AvailableTableRow[];

  return (
    <div className="space-y-4">
      <NativeMetricGrid
        items={[
          { label: 'Configured tables', value: tableGroups.length },
          { label: 'Available tables', value: availableTables.length },
        ]}
      />
      <EntityCreationLimitsClient
        availableTables={availableTables}
        tableGroups={tableGroups}
        wsId={wsId}
      />
    </div>
  );
}

type PushFlavor = 'development' | 'production' | 'staging';
type PushPlatform = 'all' | 'android' | 'ios';

function getDefaultPushAppFlavor(
  coverage: PushNotificationsSettingsSnapshot['coverage']
): PushFlavor {
  const typedCoverage = coverage as Record<
    PushFlavor,
    Record<PushPlatform, number>
  >;
  const orderedFlavors: PushFlavor[] = ['production', 'staging', 'development'];

  return orderedFlavors.reduce<PushFlavor>(
    (bestFlavor, flavor) =>
      (typedCoverage[flavor]?.all ?? 0) > (typedCoverage[bestFlavor]?.all ?? 0)
        ? flavor
        : bestFlavor,
    'production'
  );
}

function PushNotificationsNativePanel() {
  const snapshotQuery = useQuery({
    queryFn: () => getPushNotificationsSettingsSnapshot(),
    queryKey: ['native-settings', 'push-notifications'],
  });

  if (snapshotQuery.isPending) return <NativePanelLoading />;
  if (snapshotQuery.isError) {
    return <NativePanelError onRetry={() => snapshotQuery.refetch()} />;
  }

  const snapshot = snapshotQuery.data;
  const coverage = snapshot.coverage as Record<
    PushFlavor,
    Record<PushPlatform, number>
  >;

  return (
    <div className="space-y-4">
      <NativeMetricGrid
        items={[
          { label: 'Total devices', value: snapshot.summary.totalDevices ?? 0 },
          { label: 'Active 24h', value: snapshot.summary.active24h ?? 0 },
          {
            label: 'Pending batches',
            value: snapshot.summary.pendingBatches ?? 0,
          },
          {
            label: 'Failed batches',
            value: snapshot.summary.failedBatches ?? 0,
          },
        ]}
      />
      <div className="rounded-lg border p-4">
        <PushTestForm
          canSend={snapshot.canManagePush}
          defaultAppFlavor={getDefaultPushAppFlavor(snapshot.coverage)}
          deviceCoverage={coverage}
        />
      </div>
      <NativeSimpleTable
        columns={['app_flavor', 'platform', 'device_id', 'last_seen_at']}
        rows={snapshot.recentDevices}
      />
      <NativeSimpleTable
        columns={[
          'status',
          'delivery_mode',
          'notification_count',
          'updated_at',
        ]}
        rows={snapshot.recentBatches}
      />
    </div>
  );
}

function MobileVersionsNativePanel() {
  const policiesQuery = useQuery({
    queryFn: () => getMobileVersionPolicies(),
    queryKey: ['native-settings', 'mobile-versions'],
  });

  if (policiesQuery.isPending) return <NativePanelLoading />;
  if (policiesQuery.isError) {
    return <NativePanelError onRetry={() => policiesQuery.refetch()} />;
  }

  return <MobileVersionSettingsForm initialData={policiesQuery.data} />;
}
