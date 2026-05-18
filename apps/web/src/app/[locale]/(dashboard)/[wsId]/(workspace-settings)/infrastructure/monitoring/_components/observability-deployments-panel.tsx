'use client';

import {
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TriangleAlert,
} from '@tuturuuu/icons';
import type {
  BlueGreenDeploymentStage,
  BlueGreenDeploymentTarget,
  ObservabilityDeployment,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

type StageStatus = BlueGreenDeploymentStage['status'];
type StageDisplayStatus = StageStatus | 'not-applicable';
type CacheMode = 'all' | 'cached' | 'rebuilt';
type StageFilter = 'all' | string;
type TargetFilter = 'all' | BlueGreenDeploymentTarget;

const STAGE_ORDER = [
  'web-build',
  'web-promote',
  'hive-migrate',
  'hive-promote',
  'support-refresh',
  'proxy-reload',
] as const;
const TARGETS: BlueGreenDeploymentTarget[] = [
  'web',
  'hive',
  'support',
  'proxy',
];
type StageKey = (typeof STAGE_ORDER)[number];
const STATUS_TONES: Record<StageDisplayStatus, string> = {
  failed: 'border-dynamic-red/35 bg-dynamic-red/10 text-dynamic-red',
  'not-applicable': 'border-border bg-background text-muted-foreground',
  queued: 'border-border bg-muted/30 text-muted-foreground',
  running: 'border-dynamic-blue/35 bg-dynamic-blue/10 text-dynamic-blue',
  skipped: 'border-dynamic-yellow/35 bg-dynamic-yellow/10 text-dynamic-yellow',
  succeeded: 'border-dynamic-green/35 bg-dynamic-green/10 text-dynamic-green',
};

function compact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(
    value
  );
}

function timeLabel(value: number | null | undefined) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(value);
}

function selectClassName() {
  return 'h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-dynamic-blue/35';
}

function getStage(
  deployment: ObservabilityDeployment,
  id: string
): BlueGreenDeploymentStage | null {
  return deployment.stages.find((stage) => stage.id === id) ?? null;
}

function getLatestStageForTarget(
  deployments: ObservabilityDeployment[],
  target: BlueGreenDeploymentTarget
) {
  return (
    deployments
      .flatMap((deployment) => deployment.stages)
      .filter((stage) => stage.target === target)
      .sort(
        (left, right) =>
          (right.finishedAt ?? right.startedAt ?? 0) -
          (left.finishedAt ?? left.startedAt ?? 0)
      )[0] ?? null
  );
}

function getCurrentStage(deployment: ObservabilityDeployment) {
  return (
    deployment.stages.find((stage) => stage.status === 'running') ??
    deployment.stages.find((stage) => stage.status === 'failed') ??
    null
  );
}

function matchesDeployment(
  deployment: ObservabilityDeployment,
  filters: {
    cacheMode: CacheMode;
    q: string;
    stage: StageFilter;
    status: string;
    target: TargetFilter;
  }
) {
  const q = filters.q.trim().toLowerCase();
  const stageMatch =
    filters.stage === 'all' ||
    deployment.stages.some((stage) => stage.id === filters.stage);
  const statusMatch =
    filters.status === 'all' ||
    deployment.status === filters.status ||
    deployment.stages.some((stage) => stage.status === filters.status);
  const targetMatch =
    filters.target === 'all' ||
    deployment.stages.some((stage) => stage.target === filters.target);
  const cacheMatch =
    filters.cacheMode === 'all' ||
    (filters.cacheMode === 'cached' &&
      deployment.stageSummary.cacheHitCount > 0) ||
    (filters.cacheMode === 'rebuilt' &&
      deployment.stageSummary.rebuildCount > 0);
  const text = [
    deployment.color,
    deployment.commitHash,
    deployment.commitShortHash,
    deployment.commitSubject,
    deployment.deploymentKind,
    deployment.deploymentStamp,
    deployment.failureReason,
    deployment.status,
    ...deployment.supportBuildServices,
    ...deployment.stages.flatMap((stage) => [
      stage.id,
      stage.failureReason,
      stage.skippedReason,
      stage.status,
      stage.target,
      ...stage.buildServices,
      ...stage.serviceNames,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    stageMatch &&
    statusMatch &&
    targetMatch &&
    cacheMatch &&
    (!q || text.includes(q))
  );
}

function StagePill({
  label,
  stage,
}: {
  label: string;
  stage: BlueGreenDeploymentStage | null;
}) {
  const t = useTranslations('blue-green-monitoring.observability');
  const status = stage?.status ?? 'not-applicable';
  return (
    <div
      className={cn(
        'min-w-0 rounded-md border px-2 py-1 text-xs',
        STATUS_TONES[status]
      )}
    >
      <div className="truncate font-medium">{label}</div>
      <div className="truncate opacity-80">
        {status === 'not-applicable'
          ? t('deployments.stage_status.not_applicable')
          : status}
      </div>
    </div>
  );
}

function MatrixCell({
  commit,
  label,
  lastStage,
  liveColor,
}: {
  commit: string | null;
  label: string;
  lastStage: BlueGreenDeploymentStage | null;
  liveColor: string | null;
}) {
  const t = useTranslations('blue-green-monitoring.observability');
  const unknownLabel = t('states.unknown');
  const noneLabel = t('states.none');
  const status = lastStage?.status ?? 'not-applicable';
  const failed = status === 'failed';
  const Icon = failed
    ? TriangleAlert
    : status === 'succeeded'
      ? CheckCircle2
      : Clock;

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm">{label}</div>
          <div className="mt-1 truncate font-mono text-muted-foreground text-xs">
            {commit ?? unknownLabel}
          </div>
        </div>
        <Icon
          className={cn(
            'h-4 w-4',
            failed ? 'text-dynamic-red' : 'text-muted-foreground'
          )}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge className="border-border bg-muted/30" variant="outline">
          {liveColor ?? noneLabel}
        </Badge>
        <Badge className={STATUS_TONES[status]} variant="outline">
          {status === 'not-applicable'
            ? t('deployments.stage_status.not_applicable')
            : status}
        </Badge>
      </div>
      <div className="mt-2 text-muted-foreground text-xs">
        {failed
          ? t('deployments.next_retry.retry_target', { target: label })
          : t('deployments.next_retry.none')}
      </div>
    </div>
  );
}

export function ObservabilityDeploymentsPanel({
  deployments,
  emptyLabel,
  hasMore,
  isFetchingMore,
  isLoading,
  loaded,
  onLoadMore,
  total,
}: {
  deployments: ObservabilityDeployment[];
  emptyLabel: string;
  hasMore: boolean;
  isFetchingMore: boolean;
  isLoading: boolean;
  loaded: number;
  onLoadMore: () => void;
  total: number;
}) {
  const t = useTranslations('blue-green-monitoring.observability');
  const [target, setTarget] = useState<TargetFilter>('all');
  const [status, setStatus] = useState('all');
  const [stage, setStage] = useState<StageFilter>('all');
  const [cacheMode, setCacheMode] = useState<CacheMode>('all');
  const [q, setQ] = useState('');
  const stageLabels: Record<StageKey, string> = {
    'hive-migrate': t('deployments.stages.hive-migrate'),
    'hive-promote': t('deployments.stages.hive-promote'),
    'proxy-reload': t('deployments.stages.proxy-reload'),
    'support-refresh': t('deployments.stages.support-refresh'),
    'web-build': t('deployments.stages.web-build'),
    'web-promote': t('deployments.stages.web-promote'),
  };
  const targetLabels: Record<BlueGreenDeploymentTarget, string> = {
    hive: t('deployments.targets.hive'),
    proxy: t('deployments.targets.proxy'),
    support: t('deployments.targets.support'),
    web: t('deployments.targets.web'),
  };
  const getStageLabel = (stageId: string) =>
    stageLabels[stageId as StageKey] ?? stageId;
  const filtered = useMemo(
    () =>
      deployments.filter((deployment) =>
        matchesDeployment(deployment, { cacheMode, q, stage, status, target })
      ),
    [cacheMode, deployments, q, stage, status, target]
  );
  const latest = deployments[0] ?? null;
  const activeDeployment =
    deployments.find((deployment) =>
      ['building', 'deploying'].includes(deployment.status)
    ) ?? null;
  const activeStage = activeDeployment
    ? getCurrentStage(activeDeployment)
    : null;
  const failedStage = deployments
    .flatMap((deployment) => deployment.stages)
    .find((item) => item.status === 'failed');
  const webTarget = latest?.targetStates.web ?? null;
  const promotedTargets = new Set(
    deployments.flatMap((deployment) => deployment.stageSummary.promotedTargets)
  );
  const blockedTargets = new Set(
    deployments.flatMap((deployment) => deployment.stageSummary.blockedTargets)
  );
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
      {activeDeployment && activeStage ? (
        <div className="flex gap-3 rounded-lg border border-dynamic-blue/30 bg-dynamic-blue/10 p-3 text-sm">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-blue" />
          <div className="min-w-0">
            <div className="font-medium text-dynamic-blue">
              {t('deployments.current_stage_callout', {
                commit:
                  activeDeployment.commitShortHash ??
                  activeDeployment.commitHash?.slice(0, 8) ??
                  t('states.unknown'),
                stage: getStageLabel(activeStage.id),
                status: activeDeployment.status,
              })}
            </div>
            <div className="mt-1 truncate text-muted-foreground text-xs">
              {activeDeployment.commitSubject ??
                activeDeployment.deploymentKind ??
                activeDeployment.deploymentStamp ??
                activeStage.id}
            </div>
          </div>
        </div>
      ) : null}

      {failedStage ? (
        <div className="flex gap-3 rounded-lg border border-dynamic-red/30 bg-dynamic-red/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-red" />
          <div className="min-w-0">
            <div className="font-medium text-dynamic-red">
              {t('deployments.failed_callout', {
                commit:
                  webTarget?.commitShortHash ??
                  latest?.commitShortHash ??
                  latest?.commitHash?.slice(0, 8) ??
                  t('states.unknown'),
                stage: getStageLabel(failedStage.id),
              })}
            </div>
            <div className="mt-1 truncate text-muted-foreground text-xs">
              {failedStage.failureReason ??
                latest?.failureReason ??
                failedStage.id}
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        {TARGETS.map((item) => (
          <MatrixCell
            commit={
              item === 'web'
                ? (latest?.targetStates.web.commitShortHash ?? null)
                : item === 'hive'
                  ? (latest?.targetStates.hive.commitShortHash ?? null)
                  : (latest?.commitShortHash ?? null)
            }
            key={item}
            label={targetLabels[item]}
            lastStage={getLatestStageForTarget(deployments, item)}
            liveColor={
              item === 'web'
                ? (latest?.targetStates.web.activeColor ??
                  latest?.color ??
                  null)
                : item === 'hive'
                  ? (latest?.targetStates.hive.activeColor ?? null)
                  : null
            }
          />
        ))}
      </section>

      <section className="grid overflow-hidden rounded-lg border border-border md:grid-cols-4">
        {[
          [
            t('deployments.summary.promoted_targets'),
            compact(promotedTargets.size),
          ],
          [
            t('deployments.summary.blocked_targets'),
            compact(blockedTargets.size),
          ],
          [t('deployments.summary.cache_hits'), compact(cacheHits)],
          [t('deployments.summary.rebuilds'), compact(rebuilds)],
        ].map(([label, value]) => (
          <div
            className="border-border border-b p-3 md:border-r md:border-b-0"
            key={label}
          >
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className="mt-1 font-semibold text-2xl">{value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-background">
        <div className="grid gap-2 border-border border-b p-3 md:grid-cols-[minmax(180px,1fr)_repeat(4,150px)]">
          <div className="relative">
            <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              onChange={(event) => setQ(event.target.value)}
              placeholder={t('deployments.filters.search')}
              value={q}
            />
          </div>
          <select
            className={selectClassName()}
            onChange={(event) => setTarget(event.target.value as TargetFilter)}
            value={target}
          >
            <option value="all">{t('deployments.filters.all_targets')}</option>
            {TARGETS.map((item) => (
              <option key={item} value={item}>
                {targetLabels[item]}
              </option>
            ))}
          </select>
          <select
            className={selectClassName()}
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="all">{t('deployments.filters.all_statuses')}</option>
            {['succeeded', 'failed', 'running', 'skipped', 'queued'].map(
              (item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              )
            )}
          </select>
          <select
            className={selectClassName()}
            onChange={(event) => setStage(event.target.value)}
            value={stage}
          >
            <option value="all">{t('deployments.filters.all_stages')}</option>
            {STAGE_ORDER.map((item) => (
              <option key={item} value={item}>
                {stageLabels[item]}
              </option>
            ))}
          </select>
          <select
            className={selectClassName()}
            onChange={(event) => setCacheMode(event.target.value as CacheMode)}
            value={cacheMode}
          >
            <option value="all">{t('deployments.filters.all_cache')}</option>
            <option value="cached">{t('deployments.filters.cached')}</option>
            <option value="rebuilt">{t('deployments.filters.rebuilt')}</option>
          </select>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                className="h-24 animate-pulse rounded-md bg-muted/40"
                key={index}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid min-h-40 place-items-center gap-2 p-6 text-muted-foreground text-sm">
            <SlidersHorizontal className="h-5 w-5" />
            {emptyLabel}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((deployment) => {
              const currentStage = getCurrentStage(deployment);

              return (
                <div
                  className="p-3"
                  key={
                    deployment.commitHash ??
                    deployment.deploymentStamp ??
                    deployment.color ??
                    'deployment'
                  }
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_140px_120px] lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-xs">
                          {deployment.commitShortHash ??
                            deployment.commitHash?.slice(0, 8) ??
                            '-'}
                        </span>
                        <span className="truncate font-medium">
                          {deployment.commitSubject ??
                            deployment.deploymentStamp ??
                            deployment.color ??
                            'deployment'}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-6">
                        {STAGE_ORDER.map((item) => (
                          <StagePill
                            key={item}
                            label={stageLabels[item]}
                            stage={getStage(deployment, item)}
                          />
                        ))}
                      </div>
                      {currentStage ? (
                        <div className="mt-2 text-muted-foreground text-xs">
                          {t('deployments.current_stage', {
                            stage: getStageLabel(currentStage.id),
                          })}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        className="border-border bg-muted/30"
                        variant="outline"
                      >
                        {deployment.status}
                      </Badge>
                      {deployment.stageSummary.cacheHitCount > 0 ? (
                        <Badge
                          className="border-dynamic-green/35 bg-dynamic-green/10 text-dynamic-green"
                          variant="outline"
                        >
                          {t('deployments.badges.cache_hits', {
                            count: deployment.stageSummary.cacheHitCount,
                          })}
                        </Badge>
                      ) : null}
                      {deployment.stageSummary.rebuildCount > 0 ? (
                        <Badge
                          className="border-dynamic-orange/35 bg-dynamic-orange/10 text-dynamic-orange"
                          variant="outline"
                        >
                          {t('deployments.badges.rebuilds', {
                            count: deployment.stageSummary.rebuildCount,
                          })}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      <div>{timeLabel(deployment.startedAt)}</div>
                      <div className="mt-1 flex items-center gap-1">
                        <RefreshCw className="h-3.5 w-3.5" />
                        {deployment.requestCount} / {deployment.errorCount}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-border border-t px-3 py-2 text-muted-foreground text-xs">
          <span>{t('deployments.loaded', { loaded, total })}</span>
          {hasMore ? (
            <Button
              disabled={isFetchingMore}
              onClick={onLoadMore}
              size="sm"
              variant="outline"
            >
              {isFetchingMore ? t('infinite.loading') : t('load_older')}
            </Button>
          ) : (
            <span>{t('infinite.end')}</span>
          )}
        </div>
      </section>
    </div>
  );
}
