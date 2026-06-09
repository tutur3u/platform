import {
  Box,
  CircleStop,
  Cpu,
  HardDrive,
  Play,
  Radio,
  Server,
  SquareTerminal,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { listDevboxControlSnapshot } from '@/lib/devboxes/admin-store';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import {
  LeasesTable,
  MetricCard,
  RunnersTable,
  RunsTable,
  Section,
} from './devbox-control-sections';
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SquareTerminal className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-2xl">{t('title')}</h1>
          </div>
          <p className="text-foreground/80">{t('description')}</p>
        </div>
        <Badge variant="outline">{t('labels.production')}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Server className="h-4 w-4 text-muted-foreground" />}
          label={t('metrics.active_runners')}
          value={snapshot.metrics.activeRunners}
        />
        <MetricCard
          icon={<Box className="h-4 w-4 text-muted-foreground" />}
          label={t('metrics.active_leases')}
          value={snapshot.metrics.activeLeases}
        />
        <MetricCard
          icon={<Play className="h-4 w-4 text-muted-foreground" />}
          label={t('metrics.running_runs')}
          value={snapshot.metrics.runningRuns}
        />
        <MetricCard
          icon={<Radio className="h-4 w-4 text-muted-foreground" />}
          label={t('metrics.active_tokens')}
          value={snapshot.metrics.activeRunnerTokens}
        />
      </div>

      <Separator />

      <Section
        description={t('sections.runners_description')}
        title={t('sections.runners')}
      >
        <RunnersTable
          canManage={canManage}
          runners={snapshot.runners}
          t={translate}
          wsId={wsId}
        />
      </Section>

      <Section
        description={t('sections.runs_description')}
        title={t('sections.runs')}
      >
        <RunsTable
          canManage={canManage}
          runs={snapshot.runs}
          t={translate}
          wsId={wsId}
        />
      </Section>

      <Section
        description={t('sections.leases_description')}
        title={t('sections.leases')}
      >
        <LeasesTable
          canManage={canManage}
          leases={snapshot.leases}
          t={translate}
          wsId={wsId}
        />
      </Section>

      <Section
        description={t('sections.events_description')}
        title={t('sections.events')}
      >
        <EventsTable events={snapshot.events} t={translate} />
      </Section>

      <Section
        description={t('sections.caches_description')}
        title={t('sections.caches')}
      >
        <CachesTable caches={snapshot.caches} t={translate} />
      </Section>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          icon={<Cpu className="h-4 w-4 text-muted-foreground" />}
          label={t('metrics.queued_runs')}
          value={snapshot.metrics.queuedRuns}
        />
        <MetricCard
          icon={<CircleStop className="h-4 w-4 text-muted-foreground" />}
          label={t('metrics.failed_runs')}
          value={snapshot.metrics.failedRuns}
        />
        <MetricCard
          icon={<HardDrive className="h-4 w-4 text-muted-foreground" />}
          label={t('metrics.total_runs')}
          value={snapshot.metrics.totalRuns}
        />
      </div>
    </div>
  );
}
