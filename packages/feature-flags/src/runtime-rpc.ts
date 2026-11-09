import {
  isRuntimeEnvironment,
  type RuntimeEnvironment,
} from './runtime-environment';
import type {
  RuntimeOverrideRecord,
  RuntimeStoreRead,
} from './runtime-adapter';
import { classifyStoreFailure } from './runtime-adapter';
import {
  outcomeFromDatabaseError,
  parseAuditRows,
  parseMutationPayload,
  parseOverrideRows,
} from './runtime-codec';
import type {
  MutationCommand,
  MutationOutcome,
  StoredAudit,
} from './runtime-state';
import { validateMutationCommand } from './runtime-state';

export interface PrivateRpcError {
  code?: string;
  message?: string;
}

export type PrivateRpc = (
  fn: string,
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: PrivateRpcError | null }>;

export interface PrivateRpcAdmin {
  schema: (name: 'private') => { rpc: PrivateRpc };
}

export interface PrivateRpcResult {
  data: unknown;
  error: PrivateRpcError | null;
}

export type CommitRpcResult =
  | { outcome: MutationOutcome; status: 'outcome' }
  | { operationId: string; status: 'unknown' };

export type AdminStateOverride = RuntimeOverrideRecord & {
  environment: RuntimeEnvironment;
};

export type AdminStateRead =
  | { overrides: AdminStateOverride[]; status: 'ready' }
  | { status: 'denied' }
  | { status: 'unavailable' };

export type AdminAuditRead =
  | { rows: StoredAudit[]; status: 'ready' }
  | { status: 'denied' }
  | { status: 'unavailable' };

export function asPrivateRpcAdmin(admin: unknown): PrivateRpcAdmin {
  return admin as PrivateRpcAdmin;
}

export async function commitFeatureFlagRpc(input: {
  call: () => Promise<PrivateRpcResult>;
  operationId: string;
  rejected: MutationOutcome | null;
}): Promise<CommitRpcResult> {
  if (input.rejected) return { outcome: input.rejected, status: 'outcome' };
  let result: PrivateRpcResult;
  try {
    result = await input.call();
  } catch {
    return { operationId: input.operationId, status: 'unknown' };
  }
  if (result.error) {
    const mapped = outcomeFromDatabaseError(result.error);
    if (mapped) return { outcome: mapped, status: 'outcome' };
    if (classifyStoreFailure(result.error) === 'denied') {
      return {
        outcome: {
          code: 'denied',
          revision: null,
          status: 'rejected',
          storage: false,
        },
        status: 'outcome',
      };
    }
    return { operationId: input.operationId, status: 'unknown' };
  }
  const parsed = parseMutationPayload(result.data);
  if (!parsed) return { operationId: input.operationId, status: 'unknown' };
  return { outcome: parsed, status: 'outcome' };
}

export async function commitPlatformFeatureFlagMutation(input: {
  allowActor: (actorId: string) => boolean;
  call: () => Promise<PrivateRpcResult>;
  command: MutationCommand;
}): Promise<CommitRpcResult> {
  return commitFeatureFlagRpc({
    call: input.call,
    operationId: input.command.operationId,
    rejected: validateMutationCommand(input.command, {
      allowActor: input.allowActor,
    }),
  });
}

function adminFailure(error: PrivateRpcError): 'denied' | 'unavailable' {
  return classifyStoreFailure(error) === 'denied' ? 'denied' : 'unavailable';
}

export function interpretAdminStateRead(
  result: PrivateRpcResult | null
): AdminStateRead {
  if (!result) return { status: 'unavailable' };
  if (result.error) return { status: adminFailure(result.error) };
  const rows = parseOverrideRows(result.data);
  if (!rows) return { status: 'unavailable' };
  const overrides: AdminStateOverride[] = [];
  for (const row of rows) {
    if (
      typeof row.environment !== 'string' ||
      !isRuntimeEnvironment(row.environment)
    ) {
      return { status: 'unavailable' };
    }
    overrides.push({ ...row, environment: row.environment });
  }
  return { overrides, status: 'ready' };
}

export function interpretAdminAuditRead(
  result: PrivateRpcResult | null
): AdminAuditRead {
  if (!result) return { status: 'unavailable' };
  if (result.error) return { status: adminFailure(result.error) };
  const rows = parseAuditRows(result.data);
  if (!rows) return { status: 'unavailable' };
  return { rows, status: 'ready' };
}

export function interpretRuntimeRead(
  result: PrivateRpcResult | null
): RuntimeStoreRead {
  if (!result) return { status: 'unreachable' };
  if (result.error) {
    return {
      status:
        classifyStoreFailure(result.error) === 'denied'
          ? 'denied'
          : 'unreachable',
    };
  }
  const rows = parseOverrideRows(result.data);
  if (!rows) return { status: 'invalid' };
  return { overrides: rows, status: 'ready' };
}
