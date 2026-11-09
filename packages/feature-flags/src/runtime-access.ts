import {
  applyFeatureFlagMutation,
  type MutationCommand,
  type MutationOutcome,
} from './runtime-state';
import { isRuntimeEnvironment } from './runtime-environment';

export const FEATURE_FLAG_READ_PERMISSION = 'view_infrastructure';
export const FEATURE_FLAG_MUTATE_PERMISSION = 'manage_workspace_roles';
export const AUDIT_PAGE_LIMIT_DEFAULT = 50;
export const AUDIT_PAGE_LIMIT_MAX = 100;

const COMMAND_KEYS = new Set([
  'environment',
  'expectedRevision',
  'flagKey',
  'operationId',
  'overrideEnabled',
]);

const FORGED_ACTOR_KEYS = new Set(['actor', 'actorId', 'userId']);
const FORGED_TIME_KEYS = new Set([
  'occurredAt',
  'occurred_at',
  'time',
  'timestamp',
]);
const FORGED_WORKSPACE_KEYS = new Set(['workspaceId', 'wsId']);

export type AccessDecision =
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }
  | { kind: 'command'; command: MutationCommand }
  | { kind: 'outcome'; outcome: MutationOutcome };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assessFeatureFlagMutation(input: {
  authenticated: boolean;
  body: unknown;
  canMutate: boolean;
  rootMember: boolean;
  sessionActorId: string | null;
}): AccessDecision {
  if (!input.authenticated || !input.sessionActorId) {
    return { kind: 'unauthenticated' };
  }
  if (!input.rootMember || !input.canMutate) return { kind: 'forbidden' };
  if (!isRecord(input.body)) {
    return {
      kind: 'outcome',
      outcome: {
        code: 'invalid_operation',
        revision: null,
        status: 'rejected',
        storage: false,
      },
    };
  }
  let bodyActorId: string | undefined;
  let bodyTime: string | undefined;
  let bodyWorkspaceId: string | undefined;
  for (const key of Object.keys(input.body)) {
    if (FORGED_ACTOR_KEYS.has(key)) bodyActorId = 'present';
    else if (FORGED_TIME_KEYS.has(key)) bodyTime = 'present';
    else if (FORGED_WORKSPACE_KEYS.has(key)) bodyWorkspaceId = 'present';
    else if (!COMMAND_KEYS.has(key)) {
      return {
        kind: 'outcome',
        outcome: {
          code: 'invalid_operation',
          revision: null,
          status: 'rejected',
          storage: false,
        },
      };
    }
  }
  const flagKey = input.body.flagKey;
  const environment = input.body.environment;
  const operationId = input.body.operationId;
  const expectedRevision = input.body.expectedRevision;
  const overrideEnabled = input.body.overrideEnabled;
  if (
    typeof flagKey !== 'string' ||
    typeof environment !== 'string' ||
    typeof operationId !== 'string' ||
    typeof expectedRevision !== 'number'
  ) {
    return {
      kind: 'outcome',
      outcome: {
        code: 'invalid_operation',
        revision: null,
        status: 'rejected',
        storage: false,
      },
    };
  }
  if (overrideEnabled !== null && typeof overrideEnabled !== 'boolean') {
    return {
      kind: 'outcome',
      outcome: {
        code: 'invalid_override',
        revision: null,
        status: 'rejected',
        storage: false,
      },
    };
  }
  const command: MutationCommand = {
    actorId: input.sessionActorId,
    ...(bodyActorId ? { bodyActorId } : {}),
    ...(bodyTime ? { bodyTime } : {}),
    ...(bodyWorkspaceId ? { bodyWorkspaceId } : {}),
    environment,
    expectedRevision,
    flagKey,
    operationId,
    overrideEnabled,
  };
  return { kind: 'command', command };
}

export function httpStatusForMutation(outcome: MutationOutcome): number {
  if (outcome.status === 'applied' || outcome.status === 'noop') return 200;
  if (outcome.status === 'replayed') return 200;
  if (outcome.status === 'conflict') return 409;
  if (outcome.status === 'failed') return 500;
  if (outcome.code === 'denied') return 403;
  return 400;
}

export function assessFeatureFlagRead(input: {
  authenticated: boolean;
  canRead: boolean;
  rootMember: boolean;
}): 'unauthenticated' | 'forbidden' | 'allowed' {
  if (!input.authenticated) return 'unauthenticated';
  if (!input.rootMember || !input.canRead) return 'forbidden';
  return 'allowed';
}

export function boundAuditLimit(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return AUDIT_PAGE_LIMIT_DEFAULT;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > AUDIT_PAGE_LIMIT_MAX
  ) {
    return null;
  }
  return parsed;
}

export function mutationChangesLedger(
  decision: AccessDecision,
  allowActor: (actorId: string) => boolean
): boolean {
  if (decision.kind !== 'command') return false;
  const { outcome } = applyFeatureFlagMutation(
    { audits: [], states: [] },
    decision.command,
    { allowActor, now: '2026-11-09T00:00:00.000Z' }
  );
  return outcome.storage;
}

export function environmentAccepted(value: string): boolean {
  return isRuntimeEnvironment(value);
}
