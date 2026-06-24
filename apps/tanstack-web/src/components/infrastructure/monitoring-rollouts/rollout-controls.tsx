'use client';

import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure/monitoring';
import type { BlueGreenMonitoringDeploymentRollup } from './deployments';
import { RolloutPinControl } from './rollout-pin-control';
import { RolloutSyncControl } from './rollout-sync-control';
import type { MonitoringRolloutsTranslations } from './state';

export function findRuntimeDeployment(
  deployments: BlueGreenMonitoringDeploymentRollup[],
  runtimeState: 'active' | 'standby'
) {
  return deployments.find((deployment) =>
    deployment.runtimeStates.includes(runtimeState)
  );
}

export function RolloutControls({
  deployments,
  snapshot,
  t,
}: {
  deployments: BlueGreenMonitoringDeploymentRollup[];
  snapshot: BlueGreenMonitoringSnapshot;
  t: MonitoringRolloutsTranslations;
}) {
  const activeDeployment = findRuntimeDeployment(deployments, 'active');
  const standbyDeployment = findRuntimeDeployment(deployments, 'standby');
  const rollbackCandidates = deployments.filter(
    (deployment) => deployment.status === 'successful' && deployment.commitHash
  );

  return (
    <section className="rounded-lg border border-border/60 bg-background p-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <RolloutSyncControl
          activeDeployment={activeDeployment}
          deployments={deployments}
          snapshot={snapshot}
          standbyDeployment={standbyDeployment}
          t={t}
        />
        <RolloutPinControl
          rollbackCandidates={rollbackCandidates}
          snapshot={snapshot}
          t={t}
        />
      </div>
    </section>
  );
}
