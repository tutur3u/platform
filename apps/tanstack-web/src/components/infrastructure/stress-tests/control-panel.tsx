'use client';

import { Loader2, Play, Square } from '@tuturuuu/icons';
import type {
  InfrastructureStressTestProfile,
  InfrastructureStressTestProfileId,
  InfrastructureStressTestRun,
  InfrastructureStressTestTarget,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StressTestRunFields } from './control-fields';
import {
  useAbortInfrastructureStressTest,
  useQueueInfrastructureStressTest,
} from './query-hooks';
import { RunStatusBadge } from './run-summary';

function getMutationErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'STRESS_TEST_CONTROL_WRITE_FAILED'
  ) {
    return fallback;
  }

  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function parsePositiveInteger(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function InfrastructureStressTestControlPanel({
  activeRun,
  canManage,
  profiles,
  targets,
}: {
  activeRun: InfrastructureStressTestRun | null;
  canManage: boolean;
  profiles: InfrastructureStressTestProfile[];
  targets: InfrastructureStressTestTarget[];
}) {
  const t = useTranslations('blue-green-monitoring.stress_tests');
  const queueMutation = useQueueInfrastructureStressTest();
  const abortMutation = useAbortInfrastructureStressTest();
  const [targetId, setTargetId] = useState('');
  const [profileId, setProfileId] = useState('');
  const [path, setPath] = useState('');
  const [concurrency, setConcurrency] = useState('');
  const [durationSeconds, setDurationSeconds] = useState('');
  const [maxRequestsPerSecond, setMaxRequestsPerSecond] = useState('');
  const selectedTargetId = targetId || targets[0]?.id || '';
  const selectedProfile = profiles.find(
    (profile) => profile.id === (profileId || profiles[0]?.id)
  );
  const selectedProfileId = (profileId ||
    profiles[0]?.id ||
    'smoke') as InfrastructureStressTestProfileId;

  const queueRun = () => {
    queueMutation.mutate(
      {
        concurrency: parsePositiveInteger(concurrency),
        durationSeconds: parsePositiveInteger(durationSeconds),
        maxRequestsPerSecond: parsePositiveInteger(maxRequestsPerSecond),
        path: path.trim() || undefined,
        profileId: selectedProfileId,
        targetId: selectedTargetId,
      },
      {
        onError: (error) =>
          toast.error(
            getMutationErrorMessage(error, t('messages.queue_error'))
          ),
        onSuccess: () => toast.success(t('messages.queue_success')),
      }
    );
  };

  const abortRun = () => {
    if (!activeRun) {
      return;
    }

    abortMutation.mutate(
      {
        payload: { reason: 'Operator requested abort from monitoring UI.' },
        runId: activeRun.id,
      },
      {
        onError: (error) =>
          toast.error(
            getMutationErrorMessage(error, t('messages.abort_error'))
          ),
        onSuccess: () => toast.success(t('messages.abort_success')),
      }
    );
  };

  return (
    <div className="rounded-lg border border-border/60 bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-base">{t('form.title')}</h2>
          <p className="text-muted-foreground text-xs">
            {canManage ? t('form.enabled') : t('form.disabled')}
          </p>
        </div>
        {activeRun ? <RunStatusBadge status={activeRun.status} /> : null}
      </div>

      <div className="mt-4 space-y-3">
        <StressTestRunFields
          concurrency={concurrency}
          durationSeconds={durationSeconds}
          maxRequestsPerSecond={maxRequestsPerSecond}
          path={path}
          profiles={profiles}
          selectedProfile={selectedProfile}
          selectedProfileId={selectedProfileId}
          selectedTargetId={selectedTargetId}
          setConcurrency={setConcurrency}
          setDurationSeconds={setDurationSeconds}
          setMaxRequestsPerSecond={setMaxRequestsPerSecond}
          setPath={setPath}
          setProfileId={setProfileId}
          setTargetId={setTargetId}
          targets={targets}
        />

        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={
              !canManage ||
              !selectedTargetId ||
              queueMutation.isPending ||
              Boolean(activeRun)
            }
            onClick={queueRun}
          >
            {queueMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {t('actions.start')}
          </Button>
          <Button
            disabled={!canManage || !activeRun || abortMutation.isPending}
            onClick={abortRun}
            variant="outline"
          >
            {abortMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Square className="mr-2 h-4 w-4" />
            )}
            {t('actions.abort')}
          </Button>
        </div>
      </div>
    </div>
  );
}
