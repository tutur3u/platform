import { useMutation, useQuery } from '@tanstack/react-query';
import {
  checkpointHostedPlayground,
  getHostedPlaygroundRun,
  runHostedPlayground,
} from '@tuturuuu/internal-api/playgrounds';
import type { PlaygroundExecutionResult } from '@tuturuuu/types/primitives/playgrounds';
import { useRef, useState } from 'react';
import { useRunnerAvailability } from './use-runner-availability';
import { WorkbenchStepError } from './workbench-errors';
import { isRunActive } from './workbench-layout';

/** A host-owned runner, e.g. Meet's call-scoped endpoints; Learn uses the hosted playground API. */
export interface WorkbenchExecution {
  run: (payload: {
    operation: 'run' | 'stop';
    requestId: string;
    stdin?: string;
  }) => Promise<{ runId: string }>;
  read: (runId: string) => Promise<PlaygroundExecutionResult>;
}

/** Saving, starting, stopping and polling a playground run, plus the runner's availability. */
export function useWorkbenchRun({
  projectId,
  roomKey,
  execution,
  checkpoint,
  problem,
  owner,
  stdin,
  meeting,
  onStarted,
}: {
  projectId: string;
  roomKey: string;
  execution?: WorkbenchExecution;
  checkpoint?: () => Promise<unknown>;
  problem: boolean;
  owner: boolean;
  stdin: string;
  meeting: Parameters<typeof useRunnerAvailability>[0];
  onStarted: () => void;
}) {
  const runner = useRunnerAvailability(meeting);
  const [runId, setRunId] = useState<string | null>(null);
  // Wall time for runs this browser started; the run record has no timestamps.
  const timing = useRef<{
    runId: string;
    startedAt: number;
    finishedAt?: number;
  } | null>(null);
  const result = useQuery({
    queryKey: ['playground-run', roomKey, runId],
    queryFn: async () => {
      const data = execution
        ? await execution.read(runId!)
        : await getHostedPlaygroundRun(projectId, runId!);
      const started = timing.current;
      if (
        started &&
        started.runId === data.runId &&
        !started.finishedAt &&
        !isRunActive(data.status)
      )
        started.finishedAt = Date.now();
      return data;
    },
    enabled: !!runId && !problem,
    refetchInterval: (query) =>
      isRunActive(query.state.data?.status ?? 'queued') ? 300 : false,
    retry: false,
  });
  // A started run is busy from the moment it has an id: until its first status
  // arrives nothing else may start, from the button or the shortcut.
  const busy =
    isRunActive(result.data?.status) ||
    (!!runId && !problem && !result.data && !result.isError);
  const checkpointRoom =
    checkpoint ?? (() => checkpointHostedPlayground(projectId));
  const save = useMutation({ mutationFn: checkpointRoom });
  const run = useMutation({
    mutationFn: async (operation: 'run' | 'stop') => {
      if (operation === 'run' && owner)
        await checkpointRoom().catch((error: unknown) => {
          throw new WorkbenchStepError('save', error);
        });
      const payload = { operation, requestId: crypto.randomUUID(), stdin };
      const startedAt = Date.now();
      const queued = execution
        ? await execution.run(payload)
        : await runHostedPlayground(projectId, payload);
      if (operation === 'run')
        timing.current = { runId: queued.runId, startedAt };
      setRunId(queued.runId);
      onStarted();
    },
    // A run saves the room first, so an older save failure no longer applies.
    // Only a run speaks for the runner; a refused stop leaves Run as it is.
    onSuccess: (_, operation) => {
      save.reset();
      if (operation === 'run') runner.onRunStarted();
    },
    onError: (error, operation) => {
      if (operation === 'run') runner.onRunError(error);
    },
  });
  const finished = timing.current;
  return {
    result,
    busy,
    save,
    run,
    runner,
    durationMs:
      finished?.runId === runId && finished.finishedAt
        ? finished.finishedAt - finished.startedAt
        : null,
  };
}
