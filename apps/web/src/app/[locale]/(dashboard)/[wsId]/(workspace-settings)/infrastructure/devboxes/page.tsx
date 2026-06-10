import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleStop,
  Clock,
  HardDrive,
  KeyRound,
  Play,
  SquareTerminal,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { listDevboxControlSnapshot } from '@/lib/devboxes/admin-store';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import {
  FleetAlerts,
  HealthStat,
  LeasesTable,
  QueueSummary,
  RecentFailures,
  RunnersTable,
  RunsTable,
  SetupVisibilityPanel,
} from './devbox-control-sections';
import { formatDateTime, getRunnerHealth } from './devbox-control-utils';
import { CachesTable, EventsTable } from './devbox-event-cache-tables';

export const metadata: Metadata = {
  title: 'Devboxes',
  description: 'Observe and manage Tuturuuu remote devbox runners and jobs.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

function compactCommand(command: string[]) {
  return command.length ? command.join(' ') : '-';
}

export default async function InfrastructureDevboxesPage({ params }: Props) {
  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);

  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });
  if (!permissions) {
    redirect(`/${wsId}/settings`);
  }

  const canManage =
    !permissions.withoutPermission('manage_workspace_secrets') ||
    !permissions.withoutPermission('manage_workspace_roles');

  const [t, snapshot] = await Promise.all([
    getTranslations('devbox-control'),
    listDevboxControlSnapshot(),
  ]);
  const translate = (key: string) => t(key as never);
  const now = new Date();
  const activeRunners = snapshot.runners.filter(
    (runner) => runner.status !== 'revoked'
  );
  const runnerHealth = activeRunners.map((runner) =>
    getRunnerHealth(runner, now)
  );
  const onlineRunners = runnerHealth.filter(
    (health) => health.key === 'online'
  ).length;
  const neverSeenRunners = runnerHealth.filter(
    (health) => health.key === 'never_seen'
  ).length;
  const staleRunners = runnerHealth.filter(
    (health) => health.key === 'stale'
  ).length;
  const needsAttention = neverSeenRunners + staleRunners;
  const latestRun = snapshot.runs[0];
  const setupCommand =
    'ttr box setup --dir . --agent --service --runner-name "$(hostname)-devbox" --yes';

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-border bg-background">
        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <SquareTerminal className="h-5 w-5 text-primary" />
              <h1 className="font-semibold text-2xl">{t('title')}</h1>
              <Badge variant="outline">{t('labels.production')}</Badge>
            </div>
            <p className="max-w-4xl text-muted-foreground text-sm">
              {t('description')}
            </p>
          </div>
          <div className="grid gap-1 text-left text-xs lg:text-right">
            <span className="text-muted-foreground">
              {t('labels.refreshed')}
            </span>
            <span className="font-mono">
              {formatDateTime(now.toISOString())}
            </span>
            {latestRun ? (
              <span
                className="max-w-72 truncate text-muted-foreground"
                title={compactCommand(latestRun.command)}
              >
                {t('labels.latest_run')}: {compactCommand(latestRun.command)}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <HealthStat
          description={t('metrics.online_description')}
          icon={<CheckCircle2 className="h-4 w-4" />}
          label={t('metrics.online_runners')}
          tone={onlineRunners > 0 ? 'green' : 'muted'}
          value={onlineRunners}
        />
        <HealthStat
          description={t('metrics.attention_description')}
          icon={<AlertTriangle className="h-4 w-4" />}
          label={t('metrics.needs_attention')}
          tone={needsAttention > 0 ? 'amber' : 'green'}
          value={needsAttention}
        />
        <HealthStat
          description={t('metrics.queue_description')}
          icon={<Clock className="h-4 w-4" />}
          label={t('metrics.queued_runs')}
          tone={snapshot.metrics.queuedRuns > 0 ? 'amber' : 'muted'}
          value={snapshot.metrics.queuedRuns}
        />
        <HealthStat
          description={t('metrics.running_description')}
          icon={<Play className="h-4 w-4" />}
          label={t('metrics.running_runs')}
          tone={snapshot.metrics.runningRuns > 0 ? 'blue' : 'muted'}
          value={snapshot.metrics.runningRuns}
        />
        <HealthStat
          description={t('metrics.token_description')}
          icon={<KeyRound className="h-4 w-4" />}
          label={t('metrics.active_tokens')}
          tone={snapshot.metrics.activeRunnerTokens > 0 ? 'green' : 'red'}
          value={snapshot.metrics.activeRunnerTokens}
        />
        <HealthStat
          description={t('metrics.failed_description')}
          icon={<CircleStop className="h-4 w-4" />}
          label={t('metrics.failed_runs')}
          tone={snapshot.metrics.failedRuns > 0 ? 'red' : 'muted'}
          value={snapshot.metrics.failedRuns}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          <RunnersTable
            canManage={canManage}
            now={now}
            runnerTokens={snapshot.runnerTokens}
            runners={snapshot.runners}
            t={translate}
            wsId={wsId}
          />
          <RunsTable
            canManage={canManage}
            runs={snapshot.runs}
            t={translate}
            wsId={wsId}
          />
          <LeasesTable
            canManage={canManage}
            leases={snapshot.leases}
            t={translate}
            wsId={wsId}
          />
        </div>

        <aside className="space-y-4">
          <SetupVisibilityPanel
            missingHeartbeatCount={neverSeenRunners}
            setupCommand={setupCommand}
            t={translate}
          />
          <FleetAlerts now={now} runners={snapshot.runners} t={translate} />
          <QueueSummary
            queuedRuns={snapshot.metrics.queuedRuns}
            runningRuns={snapshot.metrics.runningRuns}
            t={translate}
          />
          <RecentFailures runs={snapshot.runs} t={translate} />
        </aside>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-border bg-background">
          <div className="flex items-center justify-between gap-3 border-border border-b px-4 py-3">
            <div>
              <h2 className="font-semibold text-sm">{t('sections.events')}</h2>
              <p className="text-muted-foreground text-xs">
                {t('sections.events_description')}
              </p>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="overflow-x-auto">
            <EventsTable events={snapshot.events} t={translate} />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-background">
          <div className="flex items-center justify-between gap-3 border-border border-b px-4 py-3">
            <div>
              <h2 className="font-semibold text-sm">{t('sections.caches')}</h2>
              <p className="text-muted-foreground text-xs">
                {t('sections.caches_description')}
              </p>
            </div>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="overflow-x-auto">
            <CachesTable caches={snapshot.caches} t={translate} />
          </div>
        </section>
      </div>
    </div>
  );
}
