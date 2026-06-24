'use client';

import { Loader2, Pin, PinOff } from '@tuturuuu/icons';
import type { BlueGreenMonitoringSnapshot } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';
import type { BlueGreenMonitoringDeploymentRollup } from './deployments';
import {
  useClearBlueGreenDeploymentPin,
  usePinBlueGreenDeployment,
} from './query-hooks';
import type { MonitoringRolloutsTranslations } from './state';

export function RolloutPinControl({
  rollbackCandidates,
  snapshot,
  t,
}: {
  rollbackCandidates: BlueGreenMonitoringDeploymentRollup[];
  snapshot: BlueGreenMonitoringSnapshot;
  t: MonitoringRolloutsTranslations;
}) {
  const [selectedCommitHash, setSelectedCommitHash] = useState(
    snapshot.control.deploymentPin?.commitHash ??
      rollbackCandidates[0]?.commitHash ??
      ''
  );
  const pinMutation = usePinBlueGreenDeployment();
  const clearPinMutation = useClearBlueGreenDeploymentPin();
  const selectedRollbackDeployment =
    rollbackCandidates.find(
      (deployment) => deployment.commitHash === selectedCommitHash
    ) ?? null;
  const deploymentPin = snapshot.control.deploymentPin;

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div>
        <h3 className="font-semibold">{t('controls.pin_title')}</h3>
        <p className="mt-1 text-muted-foreground text-sm">
          {deploymentPin
            ? t('controls.pin_active_description', {
                commit:
                  deploymentPin.commitShortHash ?? deploymentPin.commitHash,
              })
            : t('controls.pin_description')}
        </p>
      </div>
      <Select
        disabled={rollbackCandidates.length === 0}
        onValueChange={setSelectedCommitHash}
        value={selectedCommitHash}
      >
        <SelectTrigger className="h-11 rounded-lg border-border/60 bg-background">
          <SelectValue placeholder={t('controls.pin_select_placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {rollbackCandidates.slice(0, 20).map((deployment) => (
            <SelectItem
              key={deployment.commitHash}
              value={deployment.commitHash ?? ''}
            >
              {deployment.commitShortHash ?? deployment.commitHash} -{' '}
              {deployment.commitSubject ?? t('ledger.no_commit_subject')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex flex-wrap gap-2">
        <Button
          className="rounded-full"
          disabled={!selectedRollbackDeployment || pinMutation.isPending}
          onClick={() => {
            if (!selectedRollbackDeployment?.commitHash) {
              return;
            }

            pinMutation.mutate(selectedRollbackDeployment.commitHash, {
              onError: () => toast.error(t('controls.pin_error')),
              onSuccess: () => toast.success(t('controls.pin_success')),
            });
          }}
          variant="outline"
        >
          {pinMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Pin className="mr-2 h-4 w-4" />
          )}
          {pinMutation.isPending
            ? t('controls.pin_pending')
            : deploymentPin
              ? t('controls.pin_update_action')
              : t('controls.pin_action')}
        </Button>
        <Button
          className="rounded-full"
          disabled={!deploymentPin || clearPinMutation.isPending}
          onClick={() =>
            clearPinMutation.mutate(undefined, {
              onError: () => toast.error(t('controls.clear_pin_error')),
              onSuccess: () => toast.success(t('controls.clear_pin_success')),
            })
          }
          variant="outline"
        >
          {clearPinMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <PinOff className="mr-2 h-4 w-4" />
          )}
          {clearPinMutation.isPending
            ? t('controls.clear_pin_pending')
            : t('controls.clear_pin_action')}
        </Button>
      </div>
    </div>
  );
}
