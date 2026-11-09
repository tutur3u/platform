import type { RuntimeEnvironment } from './runtime-environment';
import { isRuntimeEnvironment } from './runtime-environment';
import { classifyFlagKey } from './runtime-policy';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StoredFlag {
  actorId: string;
  environment: string;
  flagKey: string;
  overrideEnabled: boolean | null;
  revision: number;
  updatedAt: string;
}

export interface StoredAudit {
  actorId: string;
  environment: string;
  flagKey: string;
  newOverride: boolean | null;
  newRevision: number;
  occurredAt: string;
  oldOverride: boolean | null;
  oldRevision: number;
  operationId: string;
}

export interface FlagLedger {
  audits: readonly StoredAudit[];
  states: readonly StoredFlag[];
}

export interface MutationCommand {
  actorId: string;
  bodyActorId?: string;
  bodyTime?: string;
  bodyWorkspaceId?: string;
  environment: string;
  expectedRevision: number;
  flagKey: string;
  operationId: string;
  overrideEnabled: boolean | null;
}

export type MutationOutcome =
  | {
      code:
        | 'denied'
        | 'forged_actor'
        | 'forged_time'
        | 'forged_workspace'
        | 'invalid_operation'
        | 'invalid_override'
        | 'invalid_revision'
        | 'read_only_mobile_build'
        | 'read_only_workspace_secret'
        | 'unknown_environment'
        | 'unknown_flag';
      revision: null;
      status: 'rejected';
      storage: false;
    }
  | {
      code: 'failed_audit' | 'failed_state';
      revision: null;
      status: 'failed';
      storage: false;
    }
  | {
      code: 'conflict';
      flagKey: string;
      environment: string;
      revision: number | null;
      status: 'conflict';
      storage: false;
    }
  | {
      code: 'noop';
      environment: string;
      flagKey: string;
      overrideEnabled: boolean | null;
      revision: number;
      status: 'noop';
      storage: false;
    }
  | {
      code: 'applied' | 'replayed';
      environment: string;
      flagKey: string;
      matchesRequest: boolean;
      newOverride: boolean | null;
      newRevision: number;
      oldOverride: boolean | null;
      oldRevision: number;
      operationId: string;
      replayed: boolean;
      revision: number;
      status: 'applied' | 'replayed';
      storage: boolean;
    };

export interface MutationOptions {
  allowActor: (actorId: string) => boolean;
  failAudit?: boolean;
  failState?: boolean;
  now: string;
}

export function emptyLedger(): FlagLedger {
  return { audits: [], states: [] };
}

function sameOverride(left: boolean | null, right: boolean | null): boolean {
  return left === right;
}

function replayOutcome(
  audit: StoredAudit,
  command: MutationCommand
): MutationOutcome {
  const matchesRequest =
    audit.flagKey === command.flagKey &&
    audit.environment === command.environment &&
    sameOverride(audit.newOverride, command.overrideEnabled);
  return {
    code: 'replayed',
    environment: audit.environment,
    flagKey: audit.flagKey,
    matchesRequest,
    newOverride: audit.newOverride,
    newRevision: audit.newRevision,
    oldOverride: audit.oldOverride,
    oldRevision: audit.oldRevision,
    operationId: audit.operationId,
    replayed: true,
    revision: audit.newRevision,
    status: 'replayed',
    storage: false,
  };
}

function reject(
  code: Extract<MutationOutcome, { status: 'rejected' }>['code']
): MutationOutcome {
  return { code, revision: null, status: 'rejected', storage: false };
}

export function validateMutationCommand(
  command: MutationCommand,
  options: Pick<MutationOptions, 'allowActor'>
): MutationOutcome | null {
  if (command.bodyActorId !== undefined) return reject('forged_actor');
  if (command.bodyTime !== undefined) return reject('forged_time');
  if (command.bodyWorkspaceId !== undefined) return reject('forged_workspace');
  if (!options.allowActor(command.actorId)) return reject('denied');
  if (!UUID.test(command.operationId)) return reject('invalid_operation');
  const classification = classifyFlagKey(command.flagKey);
  if (classification.family === 'workspace-secret') {
    return reject('read_only_workspace_secret');
  }
  if (classification.family === 'mobile-build') {
    return reject('read_only_mobile_build');
  }
  if (!classification.mutable) return reject('unknown_flag');
  if (!isRuntimeEnvironment(command.environment)) {
    return reject('unknown_environment');
  }
  if (
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision < 0
  ) {
    return reject('invalid_revision');
  }
  if (
    command.overrideEnabled !== null &&
    typeof command.overrideEnabled !== 'boolean'
  ) {
    return reject('invalid_override');
  }
  return null;
}

export function applyFeatureFlagMutation(
  ledger: FlagLedger,
  command: MutationCommand,
  options: MutationOptions
): { ledger: FlagLedger; outcome: MutationOutcome } {
  const rejected = validateMutationCommand(command, options);
  if (rejected) return { ledger, outcome: rejected };

  const existingAudit = ledger.audits.find(
    (audit) => audit.operationId === command.operationId
  );
  if (existingAudit) {
    return { ledger, outcome: replayOutcome(existingAudit, command) };
  }

  const current = ledger.states.find(
    (state) =>
      state.flagKey === command.flagKey &&
      state.environment === command.environment
  );

  if (!current) {
    if (command.expectedRevision !== 0) {
      return {
        ledger,
        outcome: {
          code: 'conflict',
          environment: command.environment,
          flagKey: command.flagKey,
          revision: null,
          status: 'conflict',
          storage: false,
        },
      };
    }
    if (command.overrideEnabled === null) {
      return {
        ledger,
        outcome: {
          code: 'noop',
          environment: command.environment,
          flagKey: command.flagKey,
          overrideEnabled: null,
          revision: 0,
          status: 'noop',
          storage: false,
        },
      };
    }
  } else if (current.revision !== command.expectedRevision) {
    return {
      ledger,
      outcome: {
        code: 'conflict',
        environment: command.environment,
        flagKey: command.flagKey,
        revision: current.revision,
        status: 'conflict',
        storage: false,
      },
    };
  } else if (sameOverride(current.overrideEnabled, command.overrideEnabled)) {
    return {
      ledger,
      outcome: {
        code: 'noop',
        environment: command.environment,
        flagKey: command.flagKey,
        overrideEnabled: current.overrideEnabled,
        revision: current.revision,
        status: 'noop',
        storage: false,
      },
    };
  }

  if (options.failState) {
    return {
      ledger,
      outcome: {
        code: 'failed_state',
        revision: null,
        status: 'failed',
        storage: false,
      },
    };
  }

  const oldRevision = current?.revision ?? 0;
  const oldOverride = current?.overrideEnabled ?? null;
  const newRevision = oldRevision + 1;
  const nextState: StoredFlag = {
    actorId: command.actorId,
    environment: command.environment,
    flagKey: command.flagKey,
    overrideEnabled: command.overrideEnabled,
    revision: newRevision,
    updatedAt: options.now,
  };
  if (options.failAudit) {
    return {
      ledger,
      outcome: {
        code: 'failed_audit',
        revision: null,
        status: 'failed',
        storage: false,
      },
    };
  }

  const audit: StoredAudit = {
    actorId: command.actorId,
    environment: command.environment,
    flagKey: command.flagKey,
    newOverride: command.overrideEnabled,
    newRevision,
    occurredAt: options.now,
    oldOverride,
    oldRevision,
    operationId: command.operationId,
  };
  const states = current
    ? ledger.states.map((state) =>
        state.flagKey === nextState.flagKey &&
        state.environment === nextState.environment
          ? nextState
          : state
      )
    : [...ledger.states, nextState];
  return {
    ledger: { audits: [...ledger.audits, audit], states },
    outcome: {
      code: 'applied',
      environment: command.environment,
      flagKey: command.flagKey,
      matchesRequest: true,
      newOverride: command.overrideEnabled,
      newRevision,
      oldOverride,
      oldRevision,
      operationId: command.operationId,
      replayed: false,
      revision: newRevision,
      status: 'applied',
      storage: true,
    },
  };
}

export function reconcileOperation(
  ledger: FlagLedger,
  operationId: string
): StoredAudit | null {
  return (
    ledger.audits.find((audit) => audit.operationId === operationId) ?? null
  );
}

/** Repeats a command with its original operation id. Never mints a new id. */
export function retryKnownOperation(
  ledger: FlagLedger,
  command: MutationCommand,
  options: MutationOptions
): { ledger: FlagLedger; outcome: MutationOutcome } {
  return applyFeatureFlagMutation(ledger, command, options);
}

export function environmentOf(value: string): RuntimeEnvironment | null {
  return isRuntimeEnvironment(value) ? value : null;
}
