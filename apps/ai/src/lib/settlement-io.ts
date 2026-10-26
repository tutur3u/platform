import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import {
  type AiStudioMeteringIo,
  recordAiStudioRunStep,
} from '@tuturuuu/ai/studio/metering';
import type { Json } from '@tuturuuu/types';
import type { MeteredExecutionContext, MeteredUsage } from './public-api';

export const SETTLEMENT_IO_BUDGET_MS = 10_000;
export const RECONCILIATION_IO_BUDGET_MS = 4_000;
const DISCONNECT_GRACE_MS = 30_000;
const GRACE_MARGIN_MS = 3_000;
const RECONCILIATION_SEQUENCE = 2_147_483_647;

type Phase = 'pricing' | 'settlement';
export type SettlementReconciliation = {
  outcome: 'reconciliation_required';
  completion: 'unknown';
  phase: Phase;
  runId: string;
  requestId: string;
  actorId: string | null;
  workspaceId: string;
  usage: MeteredUsage;
  recording: 'unknown' | 'confirmed';
};

export class SettlementReconciliationError extends AiStudioError {
  constructor(
    readonly outcome: SettlementReconciliation,
    cause: unknown
  ) {
    super('AI usage requires reconciliation.', {
      code: 'server_error',
      status: 503,
      type: 'server_error',
    });
    this.name = 'SettlementReconciliationError';
    this.cause = cause;
  }
}

/** Every I/O call receives an independent transport signal, never the client signal. */
export async function withSettlementIoBudget<T>(
  durationMs: number,
  operation: (io: AiStudioMeteringIo) => Promise<T>,
  fetcher: typeof globalThis.fetch = globalThis.fetch
): Promise<T> {
  if (durationMs <= 0)
    throw new DOMException('Settlement I/O budget exhausted', 'TimeoutError');
  const controller = new AbortController();
  const deadline = Promise.withResolvers<never>();
  const onAbort = () => deadline.reject(controller.signal.reason);
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException('Settlement I/O budget exhausted', 'TimeoutError')
      ),
    Math.max(0, durationMs)
  );
  const scopedFetch: typeof globalThis.fetch = (input, init) =>
    fetcher(input, { ...init, signal: controller.signal });
  try {
    return await Promise.race([
      operation({ fetch: scopedFetch }),
      deadline.promise,
    ]);
  } catch (error) {
    controller.abort(error);
    throw error;
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

function remainingBudget(
  context: MeteredExecutionContext,
  requested: number,
  reserve = 0
) {
  return context.disconnectedAt === undefined
    ? requested
    : Math.max(
        0,
        Math.min(
          requested,
          DISCONNECT_GRACE_MS -
            (Date.now() - context.disconnectedAt) -
            GRACE_MARGIN_MS -
            reserve
        )
      );
}

export async function runBudgetedSettlement<T>(
  context: MeteredExecutionContext,
  input: {
    usage: MeteredUsage;
    status: 'aborted' | 'failed' | 'succeeded';
    metadata?: Json;
  },
  operation: (
    io: AiStudioMeteringIo,
    phase: (phase: Phase) => void
  ) => Promise<T>,
  fetcher: typeof globalThis.fetch = globalThis.fetch
): Promise<T> {
  if (context.reconciliation)
    throw new SettlementReconciliationError(
      context.reconciliation,
      new Error('AI usage requires reconciliation.')
    );
  const identity = {
    runId: context.runId,
    requestId: context.requestId,
    actorId: context.credential.actorId ?? null,
    workspaceId: context.credential.workspaceId,
  };
  const usage = { ...input.usage };
  let phase: Phase = 'pricing';
  try {
    return await withSettlementIoBudget(
      remainingBudget(
        context,
        SETTLEMENT_IO_BUDGET_MS,
        RECONCILIATION_IO_BUDGET_MS
      ),
      (io) =>
        operation(io, (value) => {
          phase = value;
        }),
      fetcher
    );
  } catch (error) {
    const outcome: SettlementReconciliation = {
      ...identity,
      outcome: 'reconciliation_required',
      completion: 'unknown',
      phase,
      usage,
      recording: 'unknown',
    };
    // Fence retries before any asynchronous journal write: an unknown write is never replayed.
    context.reconciliation = outcome;
    try {
      await withSettlementIoBudget(
        remainingBudget(context, RECONCILIATION_IO_BUDGET_MS),
        (io) =>
          recordAiStudioRunStep(
            {
              runId: identity.runId,
              sequence: RECONCILIATION_SEQUENCE,
              kind: 'system',
              name: 'settlement_reconciliation',
              status: 'failed',
              errorClass: 'SettlementCompletionUnknown',
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              metadata: {
                reconciliation_required: true,
                completion: 'unknown',
                phase,
                run_id: identity.runId,
                request_id: identity.requestId,
                actor_id: identity.actorId,
                workspace_id: identity.workspaceId,
                model_id: context.modelId,
                requested_status: input.status,
                usage,
                started_at: new Date(context.startedAt).toISOString(),
              },
            },
            { ...io, throwOnError: true }
          ),
        fetcher
      );
      outcome.recording = 'confirmed';
    } catch (recordError) {
      console.error('AI usage reconciliation record has an unknown outcome', {
        ...identity,
        phase,
        recording: outcome.recording,
        errorType:
          recordError instanceof Error ? recordError.name : typeof recordError,
      });
    }
    throw new SettlementReconciliationError(outcome, error);
  } finally {
    context.releaseDisconnectListener?.();
  }
}
