import { useMutation, useQuery } from '@tanstack/react-query';
import {
  checkpointHostedPlayground,
  getHostedPlaygroundRun,
  runHostedPlayground,
} from '@tuturuuu/internal-api/playgrounds';
import type { PlaygroundExecutionResult } from '@tuturuuu/types/primitives/playgrounds';
import { useEffect, useRef, useState } from 'react';
import { useRunnerAvailability } from './use-runner-availability';
import {
  errorCode,
  failureReason,
  retryAfterSeconds,
  WorkbenchStepError,
} from './workbench-errors';
import { isRunActive } from './workbench-layout';

/** Longest a Run waits on its own for a free runner before asking the person. */
const BUSY_WAIT_MAX_S = 30;
const BUSY_WAIT_DEFAULT_S = 5;

/** What the console says while a Run is not yet running: waiting for a slot, or the runner booting. */
export type WorkbenchRunPhase = 'waiting' | 'starting';

/** A host-owned runner, e.g. Meet's call-scoped endpoints; Learn uses the hosted playground API. */
export interface WorkbenchExecution {
  run: (payload: {
    operation: 'run' | 'stop';
    requestId: string;
    /** For Stop: the Run to stop, so a newer Run is never stopped by mistake. */
    runId?: string;
    stdin?: string;
  }) => Promise<{ runId: string }>;
  read: (runId: string) => Promise<PlaygroundExecutionResult>;
}

/** Saving, starting, stopping and polling a playground run, plus the runner's availability. */
export function useWorkbenchRun({
  projectId,
  roomKey,
  execution,
  sharedRunId,
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
  sharedRunId?: string;
  checkpoint?: () => Promise<unknown>;
  problem: boolean;
  owner: boolean;
  stdin: string;
  meeting: Parameters<typeof useRunnerAvailability>[0];
  onStarted: () => void;
}) {
  const runner = useRunnerAvailability(meeting);
  // A Run this browser started wins until the room shares a different one.
  const [localRun, setLocalRun] = useState<{
    id: string;
    sharedAtStart?: string;
  }>();
  const runId =
    localRun?.sharedAtStart === sharedRunId
      ? (localRun?.id ?? sharedRunId)
      : (sharedRunId ?? localRun?.id);
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
  // Meetings wait once for a free runner; Stop or unmounting ends the wait without sending.
  const [waiting, setWaiting] = useState(false);
  const wake = useRef<() => void>(undefined);
  useEffect(() => () => wake.current?.(), []);
  // Resolves false when Stop or unmounting ends the wait early.
  const waitFor = (seconds: number) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        wake.current = undefined;
        resolve(true);
      }, seconds * 1000);
      wake.current = () => {
        clearTimeout(timer);
        wake.current = undefined;
        resolve(false);
      };
    });
  // The request ID last sent for the latest Run request: a resend or a wait
  // changes it, and a Retry must reuse the one the service may have accepted.
  const lastSent = useRef<{ inputId: string; sentId: string }>(undefined);
  const send = async (
    input: { operation: 'run' | 'stop'; stdin: string; runId?: string },
    requestId: string
  ) => {
    const { operation, stdin } = input;
    const payload = { operation, requestId, stdin };
    return execution
      ? execution.run({ ...payload, runId: input.runId })
      : runHostedPlayground(projectId, payload);
  };
  const run = useMutation({
    mutationFn: async (input: {
      operation: 'run' | 'stop';
      requestId: string;
      stdin: string;
      runId?: string;
    }) => {
      const { operation } = input;
      const startedAt = Date.now();
      const sentBefore =
        lastSent.current?.inputId === input.requestId
          ? lastSent.current.sentId
          : undefined;
      let requestId = sentBefore ?? input.requestId;
      // A conflicting Retry is shown, never re-sent under a new ID: the first
      // attempt may already be running, and sending again would run twice.
      let conflictRetried = sentBefore !== undefined;
      if (operation === 'run' && owner)
        await checkpointRoom().catch((error: unknown) => {
          throw new WorkbenchStepError('save', error);
        });
      let busyRetried = false;
      let queued: { runId: string };
      for (;;) {
        try {
          lastSent.current = { inputId: input.requestId, sentId: requestId };
          queued = await send(input, requestId);
          break;
        } catch (error) {
          // A fresh request that the service reports as a conflict: send once more as a new request.
          if (
            errorCode(error) === 'PLAYGROUND_REQUEST_CONFLICT' &&
            !conflictRetried
          ) {
            conflictRetried = true;
            requestId = crypto.randomUUID();
            continue;
          }
          // Every runner is in use: wait as told, then try once more before asking.
          if (
            meeting &&
            operation === 'run' &&
            !busyRetried &&
            failureReason(error) === 'busy'
          ) {
            busyRetried = true;
            setWaiting(true);
            const elapsed = await waitFor(
              Math.min(
                retryAfterSeconds(error) ?? BUSY_WAIT_DEFAULT_S,
                BUSY_WAIT_MAX_S
              )
            );
            // Stop ends the wait without a Run and without a failure.
            if (!elapsed) return { cancelled: true as const };
            setWaiting(false);
            requestId = crypto.randomUUID();
            continue;
          }
          throw error;
        }
      }
      if (operation === 'run')
        timing.current = { runId: queued.runId, startedAt };
      setLocalRun({ id: queued.runId, sharedAtStart: sharedRunId });
      onStarted();
      return { cancelled: false as const };
    },
    onSettled: () => setWaiting(false),
    // A run saves the room first, so an older save failure no longer applies.
    // Only a run speaks for the runner; a refused stop leaves Run as it is.
    onSuccess: (outcome, { operation }) => {
      if (outcome.cancelled) return;
      save.reset();
      if (operation === 'run') runner.onRunStarted();
    },
    onError: (error, { operation }) => {
      if (operation === 'run') runner.onRunError(error);
    },
  });
  // Each new Run or Stop gets its own request ID; a retry reuses the last one.
  const runOperation = (operation: 'run' | 'stop') => {
    // Stop while waiting for a free runner cancels the wait; there is no run to stop yet.
    if (operation === 'stop' && waiting) return wake.current?.();
    run.mutate({
      operation,
      requestId: crypto.randomUUID(),
      stdin,
      runId: operation === 'stop' ? runId : undefined,
    });
  };
  const finished = timing.current;
  const status = result.data?.status;
  // Meetings name the wait for a runner and its cold start; Learn keeps "Running…".
  const phase: WorkbenchRunPhase | undefined = !meeting
    ? undefined
    : waiting
      ? 'waiting'
      : status === 'queued'
        ? 'starting'
        : undefined;
  return {
    result,
    busy,
    phase,
    /** A Run is waiting for a free runner; Stop cancels it. */
    waiting,
    /** The service, not the program, failed: the Run never started. */
    sandboxFailed:
      !problem &&
      !isRunActive(status) &&
      result.data?.reason === 'sandbox_failed',
    save,
    run,
    runOperation,
    runner,
    durationMs:
      finished && finished.runId === runId && finished.finishedAt
        ? finished.finishedAt - finished.startedAt
        : null,
  };
}
