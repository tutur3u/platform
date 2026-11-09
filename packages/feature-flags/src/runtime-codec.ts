import type { RuntimeOverrideRecord } from './runtime-adapter';
import type { MutationOutcome, StoredAudit } from './runtime-state';

const RAISED_REJECTIONS = [
  ['platform_feature_flag_denied', 'denied'],
  ['platform_feature_flag_invalid_operation', 'invalid_operation'],
  ['platform_feature_flag_invalid_revision', 'invalid_revision'],
  ['platform_feature_flag_read_only_mobile_build', 'read_only_mobile_build'],
  [
    'platform_feature_flag_read_only_workspace_secret',
    'read_only_workspace_secret',
  ],
  ['platform_feature_flag_unknown_environment', 'unknown_environment'],
  ['platform_feature_flag_unknown_flag', 'unknown_flag'],
] as const;

export function outcomeFromDatabaseError(error: {
  message?: string;
}): MutationOutcome | null {
  const message = error.message ?? '';
  for (const [needle, code] of RAISED_REJECTIONS) {
    if (message.includes(needle)) {
      return { code, revision: null, status: 'rejected', storage: false };
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableBoolean(value: unknown): boolean | null | undefined {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  return undefined;
}

export function parseMutationPayload(value: unknown): MutationOutcome | null {
  if (!isRecord(value)) return null;
  const status = value.status;
  const flagKey = value.flagKey;
  const environment = value.environment;
  if (status === 'rejected' || status === 'failed') {
    if (typeof value.code !== 'string') return null;
    return {
      code: value.code,
      revision: null,
      status,
      storage: false,
    } as MutationOutcome;
  }
  if (status === 'conflict') {
    if (typeof flagKey !== 'string' || typeof environment !== 'string')
      return null;
    const revision = value.revision;
    if (revision !== null && typeof revision !== 'number') return null;
    return {
      code: 'conflict',
      environment,
      flagKey,
      revision,
      status: 'conflict',
      storage: false,
    };
  }
  if (status === 'noop') {
    const overrideEnabled = nullableBoolean(value.overrideEnabled);
    if (
      typeof flagKey !== 'string' ||
      typeof environment !== 'string' ||
      typeof value.revision !== 'number' ||
      overrideEnabled === undefined
    ) {
      return null;
    }
    return {
      code: 'noop',
      environment,
      flagKey,
      overrideEnabled,
      revision: value.revision,
      status: 'noop',
      storage: false,
    };
  }
  if (status === 'applied' || status === 'replayed') {
    const oldOverride = nullableBoolean(value.oldOverride);
    const newOverride = nullableBoolean(value.newOverride);
    if (
      typeof flagKey !== 'string' ||
      typeof environment !== 'string' ||
      typeof value.operationId !== 'string' ||
      typeof value.revision !== 'number' ||
      typeof value.oldRevision !== 'number' ||
      typeof value.newRevision !== 'number' ||
      typeof value.replayed !== 'boolean' ||
      typeof value.matchesRequest !== 'boolean' ||
      oldOverride === undefined ||
      newOverride === undefined
    ) {
      return null;
    }
    return {
      code: status,
      environment,
      flagKey,
      matchesRequest: value.matchesRequest,
      newOverride,
      newRevision: value.newRevision,
      oldOverride,
      oldRevision: value.oldRevision,
      operationId: value.operationId,
      replayed: value.replayed,
      revision: value.revision,
      status,
      storage: status === 'applied',
    };
  }
  return null;
}

export function parseOverrideRows(
  value: unknown
): RuntimeOverrideRecord[] | null {
  if (!isRecord(value) || !Array.isArray(value.overrides)) return null;
  const rows: RuntimeOverrideRecord[] = [];
  for (const item of value.overrides) {
    if (!isRecord(item)) return null;
    const overrideEnabled = nullableBoolean(item.overrideEnabled);
    if (
      typeof item.flagKey !== 'string' ||
      typeof item.revision !== 'number' ||
      overrideEnabled === undefined
    ) {
      return null;
    }
    if ('environment' in item && typeof item.environment !== 'string')
      return null;
    if ('updatedAt' in item && typeof item.updatedAt !== 'string') return null;
    rows.push({
      flagKey: item.flagKey,
      overrideEnabled,
      revision: item.revision,
      ...(typeof item.environment === 'string'
        ? { environment: item.environment }
        : {}),
      ...(typeof item.updatedAt === 'string'
        ? { updatedAt: item.updatedAt }
        : {}),
    });
  }
  return rows;
}

export function parseAuditRows(value: unknown): StoredAudit[] | null {
  if (!isRecord(value) || !Array.isArray(value.rows)) return null;
  const rows: StoredAudit[] = [];
  for (const item of value.rows) {
    if (!isRecord(item)) return null;
    const oldOverride = nullableBoolean(item.oldOverride);
    const newOverride = nullableBoolean(item.newOverride);
    if (
      typeof item.operationId !== 'string' ||
      typeof item.flagKey !== 'string' ||
      typeof item.environment !== 'string' ||
      typeof item.actorId !== 'string' ||
      typeof item.occurredAt !== 'string' ||
      typeof item.oldRevision !== 'number' ||
      typeof item.newRevision !== 'number' ||
      oldOverride === undefined ||
      newOverride === undefined
    ) {
      return null;
    }
    rows.push({
      actorId: item.actorId,
      environment: item.environment,
      flagKey: item.flagKey,
      newOverride,
      newRevision: item.newRevision,
      occurredAt: item.occurredAt,
      oldOverride,
      oldRevision: item.oldRevision,
      operationId: item.operationId,
    });
  }
  return rows;
}
