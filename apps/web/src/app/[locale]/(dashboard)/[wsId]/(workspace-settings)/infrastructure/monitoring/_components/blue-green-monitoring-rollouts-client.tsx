'use client';

import { Activity, Clock, Gauge, GitBranch } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import {
  ContainerResourceChart,
  DeploymentStoryChart,
  PeriodTrendChart,
  RequestVelocityChart,
} from './blue-green-monitoring-charts';
import {
  DeploymentLedger,
  EventStreamPanel,
  RolloutStagePanel,
  TrafficPeriodsPanel,
} from './blue-green-monitoring-panels';
import { useBlueGreenMonitoringSnapshot } from './blue-green-monitoring-query-hooks';
import { BlueGreenMonitoringRolloutControls } from './blue-green-monitoring-rollout-controls';
import {
  BlueGreenMonitoringAlerts,
  BlueGreenMonitoringErrorState,
  BlueGreenMonitoringLoadingState,
} from './blue-green-monitoring-state';
import {
  formatCompactNumber,
  formatDuration,
  formatRelativeTime,
} from './formatters';

export function BlueGreenMonitoringRolloutsClient() {
  const t = useTranslations('blue-green-monitoring');
  const query = useBlueGreenMonitoringSnapshot({
    requestPreviewLimit: 0,
    watcherLogLimit: 0,
  });

  if (query.isPending) {
    return <BlueGreenMonitoringLoadingState />;
  }

  if (query.error || !query.data) {
    return (
      <BlueGreenMonitoringErrorState onRetry={() => query.refetch()} t={t} />
    );
  }

  const snapshot = query.data;
  const statCards = [
    {
      icon: <GitBranch className="h-4 w-4" />,
      label: t('rollouts.cards.successful'),
      meta: t('rollouts.cards.successful_description'),
      value: `${snapshot.overview.successfulDeployments}/${snapshot.overview.totalDeployments}`,
    },
    {
      icon: <Activity className="h-4 w-4" />,
      label: t('rollouts.cards.current_traffic'),
      meta: t('stats.requests_per_minute'),
      value: formatCompactNumber(
        snapshot.overview.currentAverageRequestsPerMinute ?? 0
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
    <div className="space-y-6">
      <BlueGreenMonitoringAlerts snapshot={snapshot} t={t} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-[1.75rem] border border-border/60 bg-background/80 p-4"
          >
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.16em]">
              {card.icon}
              <span>{card.label}</span>
            </div>
            <div className="mt-3 font-semibold text-2xl">{card.value}</div>
            <div className="mt-1 text-muted-foreground text-xs">
              {card.meta}
            </div>
          </div>
        ))}
      </div>

      <RolloutStagePanel
        deployments={snapshot.deployments}
        watcher={snapshot.watcher}
      />

      <BlueGreenMonitoringRolloutControls snapshot={snapshot} />

      <div className="grid gap-6 2xl:grid-cols-[1.05fr_0.95fr]">
        <TrafficPeriodsPanel analytics={snapshot.analytics} />
        <section className="rounded-[2rem] border border-border/60 bg-background/80 p-5">
          <div className="mb-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
              {t('panels.traffic')}
            </p>
            <h3 className="mt-1 font-semibold text-lg">
              {t('chart.request_velocity')}
            </h3>
          </div>
          <PeriodTrendChart metrics={snapshot.analytics.trends.daily} />
        </section>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[2rem] border border-border/60 bg-background/80 p-5">
          <div className="mb-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
              {t('panels.deployments')}
            </p>
            <h3 className="mt-1 font-semibold text-lg">
              {t('chart.rollout_story')}
            </h3>
          </div>
          <DeploymentStoryChart deployments={snapshot.deployments} />
        </section>

        <section className="rounded-[2rem] border border-border/60 bg-background/80 p-5">
          <div className="mb-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
              {t('panels.deployments')}
            </p>
            <h3 className="mt-1 font-semibold text-lg">
              {t('chart.deploy_request_velocity')}
            </h3>
          </div>
          <RequestVelocityChart deployments={snapshot.deployments} />
        </section>
      </div>

      <section className="rounded-[2rem] border border-border/60 bg-background/80 p-5">
        <div className="mb-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
            {t('panels.containers')}
          </p>
          <h3 className="mt-1 font-semibold text-lg">
            {t('chart.container_pressure')}
          </h3>
        </div>
        <ContainerResourceChart dockerResources={snapshot.dockerResources} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <EventStreamPanel watcher={snapshot.watcher} />

        <section className="space-y-4 rounded-[2rem] border border-border/60 bg-background/80 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                {t('panels.deployments')}
              </p>
              <h3 className="mt-1 font-semibold text-lg">
                {t('ledger.title')}
              </h3>
            </div>
          </div>
          <DeploymentLedger deployments={snapshot.deployments} />
        </section>
      </div>
    </div>
  );
}
