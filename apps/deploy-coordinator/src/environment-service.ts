import { EnvironmentCore, type GrantRef } from './core';
import { isEnvironment } from './projects';
import type { EnvironmentStore } from './store';
import {
  type CompleteInput,
  CoordinatorError,
  type CreateInput,
  type Deployment,
  type Result,
} from './types';

export type CallContext = { project: string; environment: string };

export type Operation =
  | { op: 'snapshot' }
  | { op: 'get'; id: string }
  | { op: 'create'; input: CreateInput }
  | { op: 'claim'; id: string; workerId: string; runId: number | null }
  | { op: 'heartbeat'; id: string; grant: GrantRef; runId: number | null }
  | {
      op: 'complete';
      id: string;
      input: CompleteInput;
      runId: number | null;
    }
  | { op: 'skip'; id: string; runId: number | null; reason: string }
  | { op: 'cancel'; id: string; actor: string }
  | {
      op: 'resolve';
      id: string;
      outcome: 'succeeded' | 'failed';
      actor: string;
      url: string | null;
    }
  | { op: 'rollback'; id: string; actor: string }
  | { op: 'promotion'; source: Deployment; actor: string }
  | { op: 'releaseHold'; lane: string }
  | { op: 'stop'; actor: string; reason: string }
  | { op: 'resume' };

// Operator stop, resume and reads stay available after the budget runs out.
const EXEMPT = new Set<Operation['op']>(['snapshot', 'get', 'stop', 'resume']);

export type Transact = <T>(work: () => T) => T;

function dispatch(core: EnvironmentCore, operation: Operation, now: number) {
  switch (operation.op) {
    case 'snapshot':
      return core.snapshot();
    case 'get':
      return core.get(operation.id);
    case 'create':
      return core.create(operation.input, now);
    case 'claim':
      return core.claim(operation.id, operation.workerId, operation.runId, now);
    case 'heartbeat':
      return core.heartbeat(
        operation.id,
        operation.grant,
        operation.runId,
        now
      );
    case 'complete':
      return core.complete(operation.id, operation.input, operation.runId, now);
    case 'skip':
      return core.skip(operation.id, operation.runId, operation.reason, now);
    case 'cancel':
      return core.cancel(operation.id, operation.actor, now);
    case 'resolve':
      return core.resolve(
        operation.id,
        operation.outcome,
        operation.actor,
        operation.url,
        now
      );
    case 'rollback':
      return core.rollback(operation.id, operation.actor, now);
    case 'promotion':
      return core.promotion(operation.source, operation.actor, now);
    case 'releaseHold':
      return core.releaseHold(operation.lane, now);
    case 'stop':
      return core.stop(operation.actor, operation.reason, now);
    case 'resume':
      return core.resume(now);
  }
}

// Runs one operation for one environment. The charge and the lazy settlement
// commit on their own, so a call that fails afterwards still counts against
// the budget and settled leases stay settled.
export function runOperation(
  store: EnvironmentStore,
  transact: Transact,
  context: CallContext,
  operation: Operation,
  now: number,
  newId: () => string
): Result<unknown> {
  if (!isEnvironment(context.environment))
    return { ok: false, code: 'NOT_FOUND', message: 'Unknown environment' };
  const core = new EnvironmentCore(
    store,
    context.project,
    context.environment,
    newId
  );
  try {
    transact(() => core.charge(now, EXEMPT.has(operation.op)));
    transact(() => core.settle(now));
    return transact(() => ({
      ok: true as const,
      value: dispatch(core, operation, now),
    }));
  } catch (error) {
    if (error instanceof CoordinatorError)
      return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}
