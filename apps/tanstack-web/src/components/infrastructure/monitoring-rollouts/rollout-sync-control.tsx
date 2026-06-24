'use client';

import { Loader2, RefreshCw } from '@tuturuuu/icons';
import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import type { BlueGreenMonitoringDeploymentRollup } from './deployments';
import { formatClockTime } from './formatters';
import { useRequestInstantRollout } from './query-hooks';
import type { MonitoringRolloutsTranslations } from './state';

export function RolloutSyncControl({
  activeDeployment,
  deployments,
  snapshot,
  standbyDeployment,
  t,
}: {
  activeDeployment: BlueGreenMonitoringDeploymentRollup | undefined;
  deployments: BlueGreenMonitoringDeploymentRollup[];
  snapshot: BlueGreenMonitoringSnapshot;
  standbyDeployment: BlueGreenMonitoringDeploymentRollup | undefined;
  t: MonitoringRolloutsTranslations;
}) {
  const mutation = useRequestInstantRollout();
  const latestDeployment = deployments[0] ?? null;
  const activeCommit =
    activeDeployment?.commitShortHash ??
    activeDeployment?.commitHash ??
    t('states.none');
  const standbyCommit =
    standbyDeployment?.commitShortHash ??
    standbyDeployment?.commitHash ??
    t('states.none');
  const isStandbySyncBuilding =
    latestDeployment?.deploymentKind === 'standby-refresh' &&
    (latestDeployment.status === 'building' ||
      latestDeployment.status === 'deploying');
  const isAlreadySynchronized =
    activeDeployment?.commitHash != null &&
    standbyDeployment?.commitHash != null &&
    activeDeployment.commitHash === standbyDeployment.commitHash;
  const canSyncStandby =
    snapshot.watcher.health === 'live' && snapshot.runtime.activeColor != null;
  const queuedSyncAt =
    snapshot.control.instantRolloutRequest?.requestedAt ?? null;
  const isSyncLocked =
    mutation.isPending || queuedSyncAt != null || isStandbySyncBuilding;
  const syncHint = isStandbySyncBuilding
    ? t('controls.sync_building_hint')
    : queuedSyncAt
      ? t('controls.sync_queued_hint', { time: formatClockTime(queuedSyncAt) })
      : isAlreadySynchronized
        ? t('controls.already_synced')
        : canSyncStandby
          ? t('controls.ready_hint')
          : t('controls.unavailable_hint');
  const syncButtonLabel = isStandbySyncBuilding
    ? t('controls.sync_building')
    : queuedSyncAt
      ? t('controls.sync_queued')
      : mutation.isPending
        ? t('controls.sync_pending')
        : t('controls.sync_action');
  const SyncButtonIcon =
    mutation.isPending || queuedSyncAt || isStandbySyncBuilding
      ? Loader2
      : RefreshCw;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="rounded-full" variant="secondary">
          {t('controls.badge')}
        </Badge>
        <Badge className="rounded-full" variant="outline">
          {snapshot.runtime.activeColor ?? t('states.none')} /{' '}
          {snapshot.runtime.standbyColor ?? t('states.none')}
        </Badge>
      </div>
      <div>
        <h3 className="font-semibold text-lg">{t('controls.title')}</h3>
        <p className="mt-1 text-muted-foreground text-sm">
          {t('controls.description')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge className="rounded-full" variant="outline">
          {t('controls.active_commit_chip', { commit: activeCommit })}
        </Badge>
        <Badge className="rounded-full" variant="outline">
          {t('controls.standby_commit_chip', { commit: standbyCommit })}
        </Badge>
      </div>
      <p className="text-muted-foreground text-sm">{syncHint}</p>
      <Button
        className="rounded-full"
        disabled={!canSyncStandby || isSyncLocked}
        onClick={() =>
          mutation.mutate(undefined, {
            onError: () => toast.error(t('controls.sync_error')),
            onSuccess: () => toast.success(t('controls.sync_success')),
          })
        }
      >
        <SyncButtonIcon
          className={
            mutation.isPending || isSyncLocked
              ? 'mr-2 h-4 w-4 animate-spin'
              : 'mr-2 h-4 w-4'
          }
        />
        {syncButtonLabel}
      </Button>
    </div>
  );
}
