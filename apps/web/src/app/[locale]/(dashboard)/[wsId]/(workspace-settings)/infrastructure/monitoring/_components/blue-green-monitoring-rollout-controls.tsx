'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitBranch,
  Loader2,
  Radio,
  RefreshCw,
  SquareStack,
} from '@tuturuuu/icons';
import {
  type BlueGreenMonitoringDeployment,
  type BlueGreenMonitoringSnapshot,
  requestBlueGreenInstantRollout,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

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

  return (
    <section className="overflow-hidden rounded-[2rem] border border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(24,144,255,0.12),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.94),rgba(248,250,252,0.88))] p-5 dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(24,144,255,0.18),transparent_32%),linear-gradient(135deg,rgba(8,18,16,0.96),rgba(10,14,24,0.9))]">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
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

        <div className="w-full max-w-md rounded-[1.7rem] border border-border/60 bg-background/80 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border border-dynamic-blue/25 bg-dynamic-blue/10 p-2.5 text-dynamic-blue">
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
              text={t('controls.active_commit_chip', { commit: activeCommit })}
            />
            <StatusChip
              icon={<SquareStack className="h-3.5 w-3.5" />}
              text={t('controls.standby_commit_chip', {
                commit: standbyCommit,
              })}
            />
          </div>

          <Button
            className="mt-5 w-full rounded-full"
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
    <div className="rounded-[1.5rem] border border-border/60 bg-background/75 p-4">
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
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 text-xs">
      {icon}
      <span>{text}</span>
    </div>
  );
}
