import type { RuntimeDefinition } from './runtime-definition.mjs';
import type { PrivateRpcResult } from './runtime-rpc';
import {
  isIncluded,
  isUuid,
  RULE_ENVIRONMENTS,
  type RuleClient,
  type RuleEnvironment,
  type RuleMutationErrorCode,
  ruleMutationError,
} from './rule-validation';

// Framework-free HTTP contract of the rule store write path, shared by the
// admin and workspace routes. The server derives the actor and the client from
// the verified session; neither is accepted from a body.

const WRITE_FIELDS = new Set([
  'allowUserIds',
  'allowWorkspaceIds',
  'environment',
  'expectedRevision',
  'flagKey',
  'mode',
  'operationId',
  'percentage',
  'reason',
  'scope',
  'subjectId',
]);

export interface RuleWriteCommand {
  readonly actorId: string;
  readonly allowUserIds: string[] | null;
  readonly allowWorkspaceIds: string[] | null;
  readonly client: RuleClient;
  readonly environment: RuleEnvironment;
  readonly expectedRevision: number;
  readonly flagKey: string;
  readonly mode: string | null;
  readonly operationId: string;
  readonly percentage: number | null;
  readonly reason: string;
  readonly scope: string;
  readonly subjectId: string | null;
}

export type RuleApiFailure = {
  readonly error: string;
  readonly status: 400 | 403 | 404 | 409 | 422 | 503;
};

export type RuleWriteParse =
  | { readonly command: RuleWriteCommand; readonly ok: true }
  | ({ readonly ok: false } & RuleApiFailure);

function list(value: unknown): string[] | null {
  return Array.isArray(value) ? (value as string[]) : null;
}

/**
 * Validates one rule write body. `definitionFor` resolves the flag's runtime
 * block (undefined for an unknown or non-runtime flag). Unknown fields are
 * refused so a client can never name the actor, the client surface or a time.
 */
export function parseRuleWrite(
  body: unknown,
  context: {
    readonly actorId: string;
    readonly client: RuleClient;
    readonly definitionFor: (
      flagKey: string
    ) => Pick<RuntimeDefinition, 'controllers' | 'scopes'> | undefined;
  }
): RuleWriteParse {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'invalid_body', ok: false, status: 400 };
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!WRITE_FIELDS.has(key)) {
      return { error: 'forbidden_field', ok: false, status: 400 };
    }
  }
  // An absent mode must not read as an unset: null is the explicit unset.
  if (!Object.hasOwn(record, 'mode')) {
    return { error: 'feature_flag_invalid_mode', ok: false, status: 422 };
  }
  const flagKey = typeof record.flagKey === 'string' ? record.flagKey : '';
  const input = {
    allowUserIds: record.allowUserIds,
    allowWorkspaceIds: record.allowWorkspaceIds,
    client: context.client,
    environment: record.environment,
    expectedRevision: record.expectedRevision,
    flagKey: record.flagKey,
    mode: record.mode ?? null,
    operationId: record.operationId,
    percentage: record.percentage,
    reason: record.reason,
    scope: record.scope,
    subjectId: record.subjectId ?? null,
  };
  if (typeof record.reason === 'string' && record.reason.includes('\u0000')) {
    return { error: 'feature_flag_invalid_reason', ok: false, status: 422 };
  }
  const code = ruleMutationError(input, context.definitionFor(flagKey));
  if (code !== null) return { ...ruleCodeFailure(code), ok: false };
  return {
    command: {
      actorId: context.actorId,
      allowUserIds: list(record.allowUserIds),
      allowWorkspaceIds: list(record.allowWorkspaceIds),
      client: context.client,
      environment: input.environment as RuleEnvironment,
      expectedRevision: input.expectedRevision as number,
      flagKey,
      mode: input.mode as string | null,
      operationId: input.operationId as string,
      percentage: (record.percentage as number | undefined) ?? null,
      reason: input.reason as string,
      scope: input.scope as string,
      subjectId: input.subjectId as string | null,
    },
    ok: true,
  };
}

/** The `private.feature_flag_mutate_rule` arguments of a validated command. */
export function ruleWriteRpcArgs(command: RuleWriteCommand) {
  return {
    p_actor: command.actorId,
    p_allow_user_ids: command.allowUserIds,
    p_allow_workspace_ids: command.allowWorkspaceIds,
    p_client: command.client,
    p_environment: command.environment,
    p_expected_revision: command.expectedRevision,
    p_flag_key: command.flagKey,
    p_mode: command.mode,
    p_operation_id: command.operationId,
    p_percentage: command.percentage,
    p_reason: command.reason,
    p_scope: command.scope,
    p_subject_id: command.subjectId,
  };
}

function ruleCodeFailure(code: RuleMutationErrorCode): RuleApiFailure {
  if (code === 'feature_flag_unknown_flag') {
    return { error: code, status: 404 };
  }
  return { error: code, status: 422 };
}

const DATABASE_FAILURES: Readonly<Record<string, RuleApiFailure>> = {
  feature_flag_actor_rule_limit: {
    error: 'feature_flag_actor_rule_limit',
    status: 422,
  },
  feature_flag_denied: { error: 'denied', status: 403 },
  feature_flag_operation_conflict: {
    error: 'feature_flag_operation_conflict',
    status: 409,
  },
  feature_flag_operation_mismatch: {
    error: 'feature_flag_operation_mismatch',
    status: 409,
  },
  feature_flag_rule_limit: { error: 'feature_flag_rule_limit', status: 422 },
  feature_flag_subject_erasing: {
    error: 'feature_flag_subject_erasing',
    status: 409,
  },
  feature_flag_unknown_flag: {
    error: 'feature_flag_unknown_flag',
    status: 404,
  },
  feature_flag_write_lost: { error: 'conflict', status: 409 },
};

/** HTTP result of one `feature_flag_mutate_rule` RPC call. */
export function ruleWriteResponse(result: PrivateRpcResult): {
  readonly body: Record<string, unknown>;
  readonly status: number;
} {
  if (result.error) {
    const message = result.error.message ?? '';
    const known = DATABASE_FAILURES[message];
    if (known) return { body: { error: known.error }, status: known.status };
    if (
      /^feature_flag_[a-z_]+$/.test(message) &&
      result.error.code === '22023'
    ) {
      return { body: { error: message }, status: 422 };
    }
    if (result.error.code === '42501') {
      return { body: { error: 'denied' }, status: 403 };
    }
    return { body: { error: 'storage_unavailable' }, status: 503 };
  }
  const data = result.data;
  if (typeof data !== 'object' || data === null) {
    return { body: { error: 'storage_unavailable' }, status: 503 };
  }
  const row = data as Record<string, unknown>;
  if (row.status === 'conflict') {
    return {
      body: { error: 'conflict', revision: row.revision ?? null },
      status: 409,
    };
  }
  // A replay answers with the stored result, so an operation id reused for a
  // different rule must not read as the requested change being applied.
  if (row.status === 'replayed' && row.matchesRequest === false) {
    return { body: { error: 'feature_flag_operation_mismatch' }, status: 409 };
  }
  if (
    row.status !== 'applied' &&
    row.status !== 'replayed' &&
    row.status !== 'noop'
  ) {
    return { body: { error: 'storage_unavailable' }, status: 503 };
  }
  return {
    body: {
      environment: row.environment,
      flagKey: row.flagKey,
      newRule: row.newRule ?? row.rule ?? null,
      oldRule: row.oldRule ?? null,
      operationId: row.operationId ?? null,
      revision: row.revision ?? null,
      scope: row.scope,
      status: row.status,
      subjectId: row.subjectId ?? null,
    },
    status: 200,
  };
}

export interface RuleListQuery {
  readonly after: {
    readonly flagKey: string;
    readonly scope: string;
    readonly subjectId: string | null;
  } | null;
  readonly environment: RuleEnvironment;
  readonly flagKey: string | null;
  readonly limit: number;
}

/** Parses the list query; null when any parameter is malformed. */
export function parseRuleListQuery(
  params: URLSearchParams
): RuleListQuery | null {
  const environment = params.get('environment') ?? 'production';
  if (!isIncluded(RULE_ENVIRONMENTS, environment)) return null;
  const rawLimit = params.get('limit');
  const limit = rawLimit === null ? 500 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return null;
  const flagKey = params.get('flagKey');
  if (flagKey !== null && !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(flagKey)) {
    return null;
  }
  const afterFlag = params.get('afterFlagKey');
  if (afterFlag !== null && !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(afterFlag)) {
    return null;
  }
  const afterScope = params.get('afterScope');
  const afterSubject = params.get('afterSubjectId');
  let after: RuleListQuery['after'] = null;
  if (afterFlag !== null || afterScope !== null || afterSubject !== null) {
    if (
      afterFlag === null ||
      afterScope === null ||
      !['platform', 'workspace', 'user'].includes(afterScope) ||
      (afterSubject !== null && !isUuid(afterSubject))
    ) {
      return null;
    }
    after = { flagKey: afterFlag, scope: afterScope, subjectId: afterSubject };
  }
  return { after, environment, flagKey, limit };
}
