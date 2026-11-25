import {
  asPrivateRpcAdmin,
  featureFlagCatalog,
  type PrivateRpcAdmin,
  type PrivateRpcResult,
  type RuleListQuery,
  type RuleWriteCommand,
  ruleWriteResponse,
  ruleWriteRpcArgs,
} from '@tuturuuu/feature-flags';

export { asPrivateRpcAdmin };

/** The runtime block of a catalog flag, or undefined for any other key. */
export function runtimeDefinitionFor(flagKey: string) {
  const flag = featureFlagCatalog.flags.find(
    (entry) => entry.key === flagKey && entry.family === 'runtime'
  );
  return flag?.runtime;
}

async function call(
  admin: PrivateRpcAdmin,
  name: string,
  args: Record<string, unknown>
): Promise<PrivateRpcResult> {
  try {
    return await admin.schema('private').rpc(name, args);
  } catch {
    return { data: null, error: { message: 'unreachable' } };
  }
}

export async function writeRule(input: {
  admin: PrivateRpcAdmin;
  command: RuleWriteCommand;
}) {
  return ruleWriteResponse(
    await call(
      input.admin,
      'feature_flag_mutate_rule',
      ruleWriteRpcArgs(input.command)
    )
  );
}

function readFailure(result: PrivateRpcResult) {
  if (result.error) {
    return result.error.code === '42501' ||
      result.error.message === 'feature_flag_denied'
      ? { error: 'denied', status: 403 }
      : { error: 'storage_unavailable', status: 503 };
  }
  return typeof result.data === 'object' && result.data !== null
    ? null
    : { error: 'storage_unavailable', status: 503 };
}

export async function readRules(input: {
  actorId: string;
  admin: PrivateRpcAdmin;
  query: RuleListQuery;
}) {
  const { query } = input;
  const result = await call(input.admin, 'feature_flag_read_rules', {
    p_actor: input.actorId,
    p_after_flag_key: query.after?.flagKey ?? null,
    p_after_scope: query.after?.scope ?? null,
    p_after_subject_id: query.after?.subjectId ?? null,
    p_environment: query.environment,
    p_flag_key: query.flagKey,
    p_limit: query.limit,
  });
  const failure = readFailure(result);
  if (failure)
    return { body: { error: failure.error }, status: failure.status };
  const data = result.data as { nextCursor?: unknown; rules?: unknown };
  if (!Array.isArray(data.rules)) {
    return { body: { error: 'storage_unavailable' }, status: 503 };
  }
  return {
    body: { nextCursor: data.nextCursor ?? null, rules: data.rules },
    status: 200,
  };
}

export async function readRuleAudit(input: {
  actorId: string;
  admin: PrivateRpcAdmin;
  before: string | null;
  beforeId: string | null;
  limit: number;
}) {
  const result = await call(input.admin, 'feature_flag_read_audit', {
    p_actor: input.actorId,
    p_before: input.before,
    p_before_id: input.beforeId,
    p_limit: input.limit,
  });
  const failure = readFailure(result);
  if (failure)
    return { body: { error: failure.error }, status: failure.status };
  const rows = (result.data as { rows?: unknown }).rows;
  return Array.isArray(rows)
    ? { body: { rows }, status: 200 }
    : { body: { error: 'storage_unavailable' }, status: 503 };
}
