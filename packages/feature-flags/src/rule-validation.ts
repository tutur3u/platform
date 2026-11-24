import type {
  RuntimeDefinition,
  RuntimeRuleScope,
} from './runtime-definition.mjs';
import { RUNTIME_RULE_SCOPES } from './runtime-definition.mjs';

// Shape rules shared by the evaluator, API input validation and the rule store.
// Every code returned here is also raised by
// private.feature_flag_mutate_rule (20261125030000_feature_flag_rules.sql), in
// the same order, and the rule-table CHECK calls the same SQL shape function,
// so a rule the database accepts is a rule the evaluator accepts.

export const RULE_MODES = ['on', 'off', 'staff', 'rollout'] as const;
export type RuleMode = (typeof RULE_MODES)[number];

/** Environments a stored rule can target. There is no staging store. */
export const RULE_ENVIRONMENTS = ['development', 'production'] as const;
export type RuleEnvironment = (typeof RULE_ENVIRONMENTS)[number];

/** Surfaces allowed to write a rule; recorded on every audit row. */
export const RULE_CLIENTS = [
  'admin-ui',
  'workspace-ui',
  'ttr',
  'migration',
] as const;
export type RuleClient = (typeof RULE_CLIENTS)[number];

export const RULE_ALLOW_LIST_MAX = 500;
export const RULE_REASON_MAX = 500;

export type RuleShapeErrorCode =
  | 'feature_flag_invalid_scope'
  | 'feature_flag_scope_not_declared'
  | 'feature_flag_invalid_subject'
  | 'feature_flag_invalid_mode'
  | 'feature_flag_user_mode'
  | 'feature_flag_invalid_percentage'
  | 'feature_flag_invalid_allow_list';

export type RuleMutationErrorCode =
  | RuleShapeErrorCode
  | 'feature_flag_invalid_operation'
  | 'feature_flag_unknown_environment'
  | 'feature_flag_unknown_flag'
  | 'feature_flag_invalid_reason'
  | 'feature_flag_invalid_client'
  | 'feature_flag_invalid_revision'
  | 'feature_flag_self_mode';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function isAbsent(value: unknown) {
  return value === undefined || value === null;
}

function isIncluded<T extends string>(
  list: readonly T[],
  value: unknown
): value is T {
  return (
    typeof value === 'string' && (list as readonly string[]).includes(value)
  );
}

/**
 * The stored shape of one rule. `mode: null` is an unset rule (a tombstone in
 * the store), which carries no percentage or allow-list.
 */
export interface RuleShape {
  readonly scope: unknown;
  readonly subjectId: unknown;
  readonly mode: unknown;
  readonly percentage?: unknown;
  readonly allowWorkspaceIds?: unknown;
  readonly allowUserIds?: unknown;
}

function allowListError(value: unknown, mode: unknown) {
  if (isAbsent(value)) return false;
  if (mode !== 'rollout') return true;
  return (
    !Array.isArray(value) ||
    value.length > RULE_ALLOW_LIST_MAX ||
    !value.every(isUuid)
  );
}

/**
 * First shape violation of one rule, or null when it is well formed:
 * - the scope is platform, workspace or user, and declared by the flag;
 * - a platform rule has a null subject, other scopes a UUID subject;
 * - the mode is on, off, staff or rollout (or null for an unset rule);
 * - a user rule is on or off;
 * - a rollout rule has an integer percentage 0..100, other modes none;
 * - allow-lists appear only on a rollout rule, with at most 500 UUIDs each.
 */
export function ruleShapeError(
  rule: RuleShape,
  declaredScopes: readonly RuntimeRuleScope[],
  options: { readonly allowUnset?: boolean } = {}
): RuleShapeErrorCode | null {
  if (!isIncluded(RUNTIME_RULE_SCOPES, rule.scope)) {
    return 'feature_flag_invalid_scope';
  }
  if (!declaredScopes.includes(rule.scope)) {
    return 'feature_flag_scope_not_declared';
  }
  if (rule.scope === 'platform') {
    if (rule.subjectId !== null) return 'feature_flag_invalid_subject';
  } else if (!isUuid(rule.subjectId)) {
    return 'feature_flag_invalid_subject';
  }
  const unset = rule.mode === null && options.allowUnset === true;
  if (!unset && !isIncluded(RULE_MODES, rule.mode)) {
    return 'feature_flag_invalid_mode';
  }
  if (
    rule.scope === 'user' &&
    !unset &&
    rule.mode !== 'on' &&
    rule.mode !== 'off'
  ) {
    return 'feature_flag_user_mode';
  }
  if (rule.mode === 'rollout') {
    const pct = rule.percentage;
    if (
      typeof pct !== 'number' ||
      !Number.isInteger(pct) ||
      pct < 0 ||
      pct > 100
    ) {
      return 'feature_flag_invalid_percentage';
    }
  } else if (!isAbsent(rule.percentage)) {
    return 'feature_flag_invalid_percentage';
  }
  if (
    allowListError(rule.allowWorkspaceIds, rule.mode) ||
    allowListError(rule.allowUserIds, rule.mode)
  ) {
    return 'feature_flag_invalid_allow_list';
  }
  return null;
}

/** Input for one rule write, as the admin and workspace APIs accept it. */
export interface RuleMutationInput extends RuleShape {
  readonly operationId: unknown;
  readonly flagKey: unknown;
  readonly environment: unknown;
  readonly expectedRevision: unknown;
  readonly reason: unknown;
  readonly client: unknown;
}

/** Code points, matching SQL `char_length`. */
function codePointLength(value: string) {
  return [...value].length;
}

/**
 * First validation failure of a rule write, in the order the mutate RPC checks
 * it, or null. `definition` is the flag's runtime block, or undefined when the
 * flag key is not a runtime flag. Authorization (who may write the scope) stays
 * in the database; this only adds the static rule that a `self` user rule may
 * only be `off` or unset.
 */
export function ruleMutationError(
  input: RuleMutationInput,
  definition: Pick<RuntimeDefinition, 'scopes' | 'controllers'> | undefined
): RuleMutationErrorCode | null {
  if (!isUuid(input.operationId)) return 'feature_flag_invalid_operation';
  if (!isIncluded(RULE_ENVIRONMENTS, input.environment)) {
    return 'feature_flag_unknown_environment';
  }
  if (definition === undefined || typeof input.flagKey !== 'string') {
    return 'feature_flag_unknown_flag';
  }
  const shape = ruleShapeError(input, definition.scopes, { allowUnset: true });
  if (shape !== null) return shape;
  if (
    typeof input.reason !== 'string' ||
    !/\S/.test(input.reason) ||
    codePointLength(input.reason) > RULE_REASON_MAX
  ) {
    return 'feature_flag_invalid_reason';
  }
  if (!isIncluded(RULE_CLIENTS, input.client)) {
    return 'feature_flag_invalid_client';
  }
  const revision = input.expectedRevision;
  if (
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  ) {
    return 'feature_flag_invalid_revision';
  }
  if (
    input.scope === 'user' &&
    definition.controllers.user === 'self' &&
    input.mode !== null &&
    input.mode !== 'off'
  ) {
    return 'feature_flag_self_mode';
  }
  return null;
}
