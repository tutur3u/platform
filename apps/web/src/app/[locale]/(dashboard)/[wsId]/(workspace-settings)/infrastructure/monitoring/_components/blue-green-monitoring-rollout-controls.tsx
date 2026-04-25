'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitBranch,
  Loader2,
  Pin,
  PinOff,
  Radio,
  RefreshCw,
  SquareStack,
} from '@tuturuuu/icons';
import {
  type BlueGreenMonitoringDeployment,
  type BlueGreenMonitoringSnapshot,
  clearBlueGreenDeploymentPin,
  pinBlueGreenDeployment,
  requestBlueGreenInstantRollout,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';

function findRuntimeDeployment(
  deployments: BlueGreenMonitoringDeployment[],
  runtimeState: 'active' | 'standby'
) {
  return deployments.find(
    (deployment) => deployment.runtimeState === runtimeState
  );
}

export function BlueGreenMonitoringRolloutControls({
  snapshot,
}: {
  snapshot: BlueGreenMonitoringSnapshot;
}) {
  const t = useTranslations('blue-green-monitoring');
  const queryClient = useQueryClient();
  const activeDeployment = findRuntimeDeployment(
    snapshot.deployments,
    'active'
  );
  const standbyDeployment = findRuntimeDeployment(
    snapshot.deployments,
    'standby'
  );
  const activeCommit =
    activeDeployment?.commitShortHash ??
    activeDeployment?.commitHash ??
    t('states.none');
  const standbyCommit =
    standbyDeployment?.commitShortHash ??
    standbyDeployment?.commitHash ??
    t('states.none');
  const canSyncStandby =
    snapshot.watcher.health === 'live' &&
    snapshot.runtime.activeColor != null &&
    snapshot.runtime.standbyColor != null;
  const isAlreadySynchronized =
    activeDeployment?.commitHash != null &&
    standbyDeployment?.commitHash != null &&
    activeDeployment.commitHash === standbyDeployment.commitHash;
  const rollbackCandidates = useMemo(
    () =>
      snapshot.deployments
        .filter(
          (deployment) =>
            deployment.status === 'successful' && deployment.commitHash
        )
        .sort(
          (left, right) =>
            (right.finishedAt ?? right.activatedAt ?? right.startedAt ?? 0) -
            (left.finishedAt ?? left.activatedAt ?? left.startedAt ?? 0)
        ),
    [snapshot.deployments]
  );
  const [selectedCommitHash, setSelectedCommitHash] = useState(
    snapshot.control.deploymentPin?.commitHash ??
      rollbackCandidates[0]?.commitHash ??
      ''
  );
  const selectedRollbackDeployment =
    rollbackCandidates.find(
      (deployment) => deployment.commitHash === selectedCommitHash
    ) ??
    rollbackCandidates[0] ??
    null;
  const mutation = useMutation({
    mutationFn: () => requestBlueGreenInstantRollout(),
    onSuccess: async () => {
      toast.success(t('controls.sync_success'));
      await queryClient.invalidateQueries({
        queryKey: ['infrastructure', 'monitoring', 'blue-green'],
      });
    },
    onError: () => {
      toast.error(t('controls.sync_error'));
    },
  });
  const pinMutation = useMutation({
    mutationFn: () =>
      pinBlueGreenDeployment({
        commitHash: selectedRollbackDeployment?.commitHash ?? '',
      }),
    onSuccess: async () => {
      toast.success(t('controls.pin_success'));
      await queryClient.invalidateQueries({
        queryKey: ['infrastructure', 'monitoring', 'blue-green'],
      });
    },
    onError: () => {
      toast.error(t('controls.pin_error'));
    },
  });
  const clearPinMutation = useMutation({
    mutationFn: () => clearBlueGreenDeploymentPin(),
    onSuccess: async () => {
      toast.success(t('controls.clear_pin_success'));
      await queryClient.invalidateQueries({
        queryKey: ['infrastructure', 'monitoring', 'blue-green'],
      });
    },
    onError: () => {
      toast.error(t('controls.clear_pin_error'));
    },
  });
  const deploymentPin = snapshot.control.deploymentPin;

  return (
    <section className="rounded-lg border border-border/60 bg-background p-4">
      <div className="grid gap-4 2xl:grid-cols-[1fr_0.8fr]">
        <div className="max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full">
              {t('controls.badge')}
            </Badge>
            <Badge variant="outline" className="rounded-full">
              {snapshot.runtime.activeColor ?? t('states.none')} /{' '}
              {snapshot.runtime.standbyColor ?? t('states.none')}
            </Badge>
          </div>

          <div>
            <h3 className="font-semibold text-xl tracking-tight">
              {t('controls.title')}
            </h3>
            <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
              {t('controls.description')}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <CommitStateCard
              icon={<Radio className="h-4 w-4" />}
              label={t('controls.live_lane')}
              value={activeCommit}
              meta={snapshot.runtime.activeColor ?? t('states.none')}
            />
            <CommitStateCard
              icon={<SquareStack className="h-4 w-4" />}
              label={t('controls.standby_lane')}
              value={standbyCommit}
              meta={snapshot.runtime.standbyColor ?? t('states.none')}
            />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-1">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-dynamic-blue/25 bg-dynamic-blue/10 p-2.5 text-dynamic-blue">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <p className="font-medium text-sm">
                  {t('controls.instant_rollout')}
                </p>
                <p className="text-muted-foreground text-sm">
                  {isAlreadySynchronized
                    ? t('controls.already_synced')
                    : canSyncStandby
                      ? t('controls.ready_hint')
                      : t('controls.unavailable_hint')}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <StatusChip
                icon={<GitBranch className="h-3.5 w-3.5" />}
                text={t(`watcher_health.${snapshot.watcher.health}`)}
              />
              <StatusChip
                icon={<Radio className="h-3.5 w-3.5" />}
                text={t('controls.active_commit_chip', {
                  commit: activeCommit,
                })}
              />
              <StatusChip
                icon={<SquareStack className="h-3.5 w-3.5" />}
                text={t('controls.standby_commit_chip', {
                  commit: standbyCommit,
                })}
              />
            </div>

            <Button
              className="mt-5 w-full"
              disabled={
                !canSyncStandby || isAlreadySynchronized || mutation.isPending
              }
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('controls.sync_pending')}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t('controls.sync_action')}
                </>
              )}
            </Button>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-md border border-dynamic-amber/25 bg-dynamic-amber/10 p-2.5 text-dynamic-amber">
                <Pin className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <p className="font-medium text-sm">
                  {deploymentPin
                    ? t('controls.pin_active_title')
                    : t('controls.pin_title')}
                </p>
                <p className="text-muted-foreground text-sm">
                  {deploymentPin
                    ? t('controls.pin_active_description', {
                        commit:
                          deploymentPin.commitShortHash ??
                          deploymentPin.commitHash.slice(0, 12),
                      })
                    : t('controls.pin_description')}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <Select
                disabled={
                  rollbackCandidates.length === 0 || pinMutation.isPending
                }
                onValueChange={setSelectedCommitHash}
                value={selectedRollbackDeployment?.commitHash ?? ''}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={t('controls.pin_select_placeholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {rollbackCandidates.map((deployment) => (
                    <SelectItem
                      key={deployment.commitHash}
                      value={deployment.commitHash ?? ''}
                    >
                      {deployment.commitShortHash ?? deployment.commitHash}{' '}
                      {deployment.commitSubject ?? t('states.none')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="flex-1"
                  disabled={
                    !selectedRollbackDeployment ||
                    pinMutation.isPending ||
                    clearPinMutation.isPending
                  }
                  onClick={() => pinMutation.mutate()}
                  variant={deploymentPin ? 'secondary' : 'default'}
                >
                  {pinMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('controls.pin_pending')}
                    </>
                  ) : (
                    <>
                      <Pin className="mr-2 h-4 w-4" />
                      {deploymentPin
                        ? t('controls.pin_update_action')
                        : t('controls.pin_action')}
                    </>
                  )}
                </Button>
                <Button
                  className="flex-1"
                  disabled={
                    !deploymentPin ||
                    pinMutation.isPending ||
                    clearPinMutation.isPending
                  }
                  onClick={() => clearPinMutation.mutate()}
                  variant="outline"
                >
                  {clearPinMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('controls.clear_pin_pending')}
                    </>
                  ) : (
                    <>
                      <PinOff className="mr-2 h-4 w-4" />
                      {t('controls.clear_pin_action')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CommitStateCard({
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
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.16em]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-3 font-semibold text-2xl">{value}</div>
      <div className="mt-1 text-muted-foreground text-xs">{meta}</div>
    </div>
  );
}

function StatusChip({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs">
      {icon}
      <span>{text}</span>
    </div>
  );
}
