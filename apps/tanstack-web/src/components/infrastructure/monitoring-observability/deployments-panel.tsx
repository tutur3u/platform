'use client';

import { Box, Clock, GitCommit, TriangleAlert } from '@tuturuuu/icons';
import type {
  BlueGreenMonitoringSnapshot,
  ObservabilityDeployment,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import {
  formatCompactNumber,
  formatDateTime,
  formatLatencyMs,
} from './formatters';
import { EmptyState, LoadingSkeleton, ToneBadge } from './primitives';
import type { MonitoringTone, MonitoringTranslator } from './types';

function getDeploymentTone(
  deployment: ObservabilityDeployment
): MonitoringTone {
  const raw = `${deployment.runtimeState ?? ''} ${deployment.status ?? ''}`
    .toLowerCase()
    .trim();

  if (raw.includes('fail') || raw.includes('error')) return 'red';
  if (raw.includes('deploy') || raw.includes('build')) return 'amber';
  if (raw.includes('queue') || raw.includes('pending')) return 'muted';
  return 'green';
}

function getDeploymentState(
  deployment: ObservabilityDeployment,
  t: MonitoringTranslator
) {
  const tone = getDeploymentTone(deployment);

  if (tone === 'red') return t('deployment_states.error');
  if (tone === 'amber') return t('deployment_states.deploying');
  if (tone === 'muted') return t('deployment_states.queued');
  return t('deployment_states.ready');
}

export function DeploymentsPanel({
  deployments,
  emptyLabel,
  hasMore,
  isFetchingMore,
  isLoading,
  loaded,
  loadingLabel,
  moreLabel,
  onLoadMore,
  snapshot,
  t,
  total,
}: {
  deployments: ObservabilityDeployment[];
  emptyLabel: string;
  hasMore: boolean;
  isFetchingMore: boolean;
  isLoading: boolean;
  loaded: number;
  loadingLabel: string;
  moreLabel: string;
  onLoadMore: () => void;
  snapshot: BlueGreenMonitoringSnapshot | null;
  t: MonitoringTranslator;
  total: number;
}) {
  const successfulRecoveryImages =
    snapshot?.recoveryCache?.deployments.filter(
      (deployment) => deployment.status === 'successful'
    ).length ?? 0;
  const cacheHits = deployments.reduce(
    (sum, deployment) => sum + deployment.stageSummary.cacheHitCount,
    0
  );
  const rebuilds = deployments.reduce(
    (sum, deployment) => sum + deployment.stageSummary.rebuildCount,
    0
  );

  return (
    <div className="space-y-4">
      <section className="grid overflow-hidden rounded-lg border border-border md:grid-cols-4">
        <SummaryCell
          icon={Box}
          label={t('deployments.summary.history')}
          meta={t('deployments.summary.history_meta')}
          value={formatCompactNumber(total)}
        />
        <SummaryCell
          icon={Clock}
          label={t('deployments.summary.cache_hits')}
          value={formatCompactNumber(cacheHits)}
        />
        <SummaryCell
          icon={GitCommit}
          label={t('deployments.summary.rebuilds')}
          value={formatCompactNumber(rebuilds)}
        />
        <SummaryCell
          icon={TriangleAlert}
          label={t('deployments.summary.recovery_cache')}
          meta={t('deployments.summary.recovery_cache_meta')}
          value={formatCompactNumber(successfulRecoveryImages)}
        />
      </section>
      <section className="rounded-lg border border-border bg-background">
        <div className="flex flex-col gap-2 border-border border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-sm">{t('deployments.title')}</p>
            <p className="text-muted-foreground text-xs">
              {t('deployments.description')}
            </p>
          </div>
          <Badge className="rounded-full" variant="outline">
            {t('deployments.loaded', { loaded, total })}
          </Badge>
        </div>
        {isLoading ? (
          <LoadingSkeleton rows={8} />
        ) : deployments.length === 0 ? (
          <EmptyState label={emptyLabel} />
        ) : (
          <div className="divide-y divide-border/60">
            {deployments.map((deployment) => (
              <DeploymentRow
                deployment={deployment}
                key={deployment.deploymentStamp ?? deployment.commitHash}
                t={t}
              />
            ))}
          </div>
        )}
        {hasMore ? (
          <div className="border-border border-t px-4 py-3">
            <Button
              disabled={isFetchingMore}
              onClick={onLoadMore}
              size="sm"
              type="button"
              variant="outline"
            >
              {isFetchingMore ? loadingLabel : moreLabel}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SummaryCell({
  icon: Icon,
  label,
  meta,
  value,
}: {
  icon: typeof Box;
  label: string;
  meta?: string;
  value: string;
}) {
  return (
    <div className="border-border/70 border-r border-b bg-background px-5 py-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="mt-3 text-muted-foreground text-xs">{label}</p>
      <p className="mt-2 font-semibold text-2xl tracking-tight">{value}</p>
      {meta ? (
        <p className="mt-1 text-muted-foreground text-xs">{meta}</p>
      ) : null}
    </div>
  );
}

function DeploymentRow({
  deployment,
  t,
}: {
  deployment: ObservabilityDeployment;
  t: MonitoringTranslator;
}) {
  const currentStage =
    deployment.stages.find((stage) => stage.status === 'running') ??
    deployment.stages.find((stage) => stage.status === 'failed') ??
    deployment.stages[0] ??
    null;
  const tone = getDeploymentTone(deployment);

  return (
    <article className="grid gap-4 px-4 py-4 text-sm xl:grid-cols-[minmax(0,1fr)_220px_220px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <ToneBadge tone={tone}>{getDeploymentState(deployment, t)}</ToneBadge>
          {deployment.runtimeState ? (
            <Badge variant="secondary">{deployment.runtimeState}</Badge>
          ) : null}
          {deployment.deploymentKind ? (
            <Badge variant="outline">{deployment.deploymentKind}</Badge>
          ) : null}
        </div>
        <p className="mt-2 truncate font-mono">
          {deployment.commitShortHash ?? deployment.commitHash ?? '-'}
          {deployment.commitSubject ? (
            <span className="ml-2 font-medium font-sans">
              {deployment.commitSubject}
            </span>
          ) : null}
        </p>
        <p className="mt-1 truncate text-muted-foreground text-xs">
          {deployment.deploymentStamp ?? deployment.imageTag ?? '-'}
        </p>
        {deployment.failureReason ? (
          <p className="mt-2 rounded-md border border-dynamic-red/30 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-xs">
            {deployment.failureReason}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2 text-xs">
        <Metric label={t('columns.requests')} value={deployment.requestCount} />
        <Metric label={t('columns.errors')} value={deployment.errorCount} />
        <Metric
          label={t('columns.build_time')}
          value={formatLatencyMs(deployment.durationMs)}
        />
      </div>
      <div className="grid gap-2 text-xs">
        <Metric
          label={t('columns.last_request')}
          value={formatDateTime(deployment.lastRequestAt)}
        />
        <Metric
          label={t('deployments.current_stage', {
            stage: currentStage?.id ?? '-',
          })}
          value={currentStage?.status ?? '-'}
        />
        <div className="flex flex-wrap gap-1.5">
          {deployment.stageSummary.cacheHitCount > 0 ? (
            <Badge className="rounded-full" variant="secondary">
              {t('deployments.badges.cache_hits', {
                count: deployment.stageSummary.cacheHitCount,
              })}
            </Badge>
          ) : null}
          {deployment.stageSummary.rebuildCount > 0 ? (
            <Badge className="rounded-full" variant="secondary">
              {t('deployments.badges.rebuilds', {
                count: deployment.stageSummary.rebuildCount,
              })}
            </Badge>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | string | null | undefined;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <span className="truncate text-muted-foreground">{label}</span>
      <span
        className={cn('truncate font-mono', typeof value === 'number' && '')}
      >
        {typeof value === 'number'
          ? formatCompactNumber(value)
          : (value ?? '-')}
      </span>
    </div>
  );
}
