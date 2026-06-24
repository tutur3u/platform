'use client';

import { useTranslations } from 'use-intl';
import { DeploymentLedger } from './deployment-ledger';
import { dedupeBlueGreenDeployments } from './deployments';
import { RolloutEventStream } from './event-stream';
import { useBlueGreenMonitoringRolloutsSnapshot } from './query-hooks';
import { RolloutControls } from './rollout-controls';
import { RolloutStagePanel } from './rollout-stage-panel';
import {
  MonitoringRolloutsAlerts,
  MonitoringRolloutsErrorState,
  MonitoringRolloutsLoadingState,
} from './state';
import { RolloutsSummary } from './summary';

export function MonitoringRolloutsClient() {
  const t = useTranslations('blue-green-monitoring');
  const query = useBlueGreenMonitoringRolloutsSnapshot({
    requestPreviewLimit: 0,
    watcherLogLimit: 0,
  });

  if (query.isPending) {
    return <MonitoringRolloutsLoadingState />;
  }

  if (query.error || !query.data) {
    return (
      <MonitoringRolloutsErrorState onRetry={() => query.refetch()} t={t} />
    );
  }

  const snapshot = query.data;
  const deployments = dedupeBlueGreenDeployments(snapshot.deployments);

  return (
    <div className="space-y-6">
      <MonitoringRolloutsAlerts snapshot={snapshot} t={t} />
      <RolloutsSummary deployments={deployments} snapshot={snapshot} t={t} />
      <RolloutStagePanel deployments={deployments} t={t} />
      <RolloutControls deployments={deployments} snapshot={snapshot} t={t} />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <RolloutEventStream snapshot={snapshot} t={t} />
        <DeploymentLedger deployments={deployments} t={t} />
      </div>
    </div>
  );
}
