'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import type { BlueGreenMonitoringDeploymentRollup } from './deployments';
import {
  formatDateTime,
  formatDuration,
  getDeploymentStatusTranslationKey,
  getRuntimeBadgeTranslationKey,
} from './formatters';
import type { MonitoringRolloutsTranslations } from './state';

function statusTone(status: string | null | undefined) {
  if (status === 'failed' || status === 'canceled') {
    return 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red';
  }

  if (status === 'building' || status === 'deploying') {
    return 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue';
  }

  if (status === 'successful' || status === 'active') {
    return 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green';
  }

  return 'border-border/70 bg-muted/40 text-muted-foreground';
}

export function RolloutStagePanel({
  deployments,
  t,
}: {
  deployments: BlueGreenMonitoringDeploymentRollup[];
  t: MonitoringRolloutsTranslations;
}) {
  const latestDeployment = deployments[0] ?? null;
  const stageRows = latestDeployment?.stages ?? [];

  return (
    <section className="rounded-lg border border-border/60 bg-background p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            {t('rollout.route')}
          </p>
          <h2 className="mt-1 font-semibold text-xl">
            {latestDeployment?.commitSubject ?? t('rollout.idle_title')}
          </h2>
          <p className="mt-2 text-muted-foreground text-sm">
            {latestDeployment?.deploymentStamp ?? t('rollout.description')}
          </p>
        </div>
        <Badge
          className={cn(
            'rounded-full border',
            statusTone(latestDeployment?.status)
          )}
          variant="outline"
        >
          {t(getDeploymentStatusTranslationKey(latestDeployment?.status))}
        </Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-muted-foreground text-xs">{t('rollout.commit')}</p>
          <p className="mt-1 truncate font-medium">
            {latestDeployment?.commitShortHash ??
              latestDeployment?.commitHash ??
              t('states.none')}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-muted-foreground text-xs">
            {t('rollout.phase_time')}
          </p>
          <p className="mt-1 font-medium">
            {formatDuration(
              latestDeployment?.buildDurationMs ?? latestDeployment?.lifetimeMs
            )}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-muted-foreground text-xs">
            {t('rollout.last_change')}
          </p>
          <p className="mt-1 font-medium">
            {formatDateTime(
              latestDeployment?.finishedAt ??
                latestDeployment?.activatedAt ??
                latestDeployment?.startedAt
            )}
          </p>
        </div>
      </div>

      {stageRows.length > 0 ? (
        <div className="mt-5 space-y-3">
          {stageRows.map((stage) => (
            <div
              className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 md:grid-cols-[0.75fr_1fr_auto]"
              key={stage.id}
            >
              <div>
                <p className="font-medium text-sm">{stage.target}</p>
                <p className="text-muted-foreground text-xs">
                  {stage.color ?? t('states.none')}
                </p>
              </div>
              <div className="text-muted-foreground text-sm">
                {stage.failureReason ??
                  stage.skippedReason ??
                  stage.serviceNames.join(', ') ??
                  t('states.none')}
              </div>
              <Badge
                className={cn(
                  'w-fit rounded-full border',
                  statusTone(stage.status)
                )}
                variant="outline"
              >
                {stage.status}
              </Badge>
            </div>
          ))}
        </div>
      ) : null}

      {latestDeployment?.runtimeStates.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {latestDeployment.runtimeStates.map((runtimeState) => {
            const key = getRuntimeBadgeTranslationKey(runtimeState);

            return (
              <Badge
                className="rounded-full"
                key={runtimeState}
                variant="secondary"
              >
                {key ? t(key) : runtimeState}
              </Badge>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
