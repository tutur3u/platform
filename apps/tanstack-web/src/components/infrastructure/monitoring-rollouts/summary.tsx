'use client';

import { Activity, Clock, Gauge, GitBranch } from '@tuturuuu/icons';
import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure/monitoring';
import type { ReactNode } from 'react';
import type { BlueGreenMonitoringDeploymentRollup } from './deployments';
import {
  formatCompactNumber,
  formatDuration,
  formatRelativeTime,
} from './formatters';
import type { MonitoringRolloutsTranslations } from './state';

function SummaryMetricCard({
  icon,
  label,
  meta,
  value,
}: {
  icon: ReactNode;
  label: string;
  meta: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.16em]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-3 font-semibold text-2xl">{value}</div>
      <div className="mt-1 text-muted-foreground text-xs">{meta}</div>
    </div>
  );
}

export function RolloutsSummary({
  deployments,
  snapshot,
  t,
}: {
  deployments: BlueGreenMonitoringDeploymentRollup[];
  snapshot: BlueGreenMonitoringSnapshot;
  t: MonitoringRolloutsTranslations;
}) {
  const successfulDeployments = deployments.filter(
    (deployment) => deployment.status === 'successful'
  ).length;
  const statCards = [
    {
      icon: <GitBranch className="h-4 w-4" />,
      label: t('rollouts.cards.successful'),
      meta: t('rollouts.cards.successful_description'),
      value: `${successfulDeployments}/${deployments.length}`,
    },
    {
      icon: <Activity className="h-4 w-4" />,
      label: t('rollouts.cards.current_traffic'),
      meta: t('stats.requests_per_minute'),
      value: formatCompactNumber(
        snapshot.overview.currentAverageRequestsPerMinute
      ),
    },
    {
      icon: <Clock className="h-4 w-4" />,
      label: t('rollouts.cards.mean_rollout'),
      meta: formatRelativeTime(snapshot.watcher.lastDeployAt),
      value: formatDuration(snapshot.overview.averageBuildDurationMs),
    },
    {
      icon: <Gauge className="h-4 w-4" />,
      label: t('rollouts.cards.last_result'),
      meta: t('rollouts.cards.last_result_description'),
      value: snapshot.watcher.lastDeployStatus ?? t('states.none'),
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {statCards.map((card) => (
        <SummaryMetricCard key={card.label} {...card} />
      ))}
    </div>
  );
}
