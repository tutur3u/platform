import type { CatalogFlag } from './lifecycle.mjs';
import type { RuntimeRuleScope } from './runtime-definition.mjs';
import { ruleShapeError } from './rule-validation';

export type RuntimeRuleMode = 'on' | 'off' | 'staff' | 'rollout';

/** One stored rule for a runtime flag. `subjectId` is null at platform scope. */
export interface RuntimeRule {
  readonly flagKey: string;
  readonly scope: RuntimeRuleScope;
  readonly subjectId: string | null;
  readonly mode: RuntimeRuleMode;
  /** Integer 0 to 100; required by `rollout` and absent otherwise. */
  readonly percentage?: number | null;
  /** Rollout only: at most 500 workspace UUIDs admitted before the bucket. */
  readonly allowWorkspaceIds?: readonly string[] | null;
  /** Rollout only: at most 500 user UUIDs admitted before the bucket. */
  readonly allowUserIds?: readonly string[] | null;
}

/**
 * Verified request identity. `isStaff` comes from the server's verified actor
 * (for example `isInternalFeatureAudience`), never from request input.
 */
export interface RuntimeEvaluationContext {
  readonly isStaff: boolean;
  readonly userId: string | null;
  readonly workspaceId: string | null;
}

export type RuntimeDecisionSource =
  | 'kill-switch'
  | 'user'
  | 'workspace'
  | 'platform'
  | 'self-opt-out'
  | 'env-fallback'
  | 'invalid-rules'
  | 'default';

export interface RuntimeDecision {
  readonly enabled: boolean;
  readonly source: RuntimeDecisionSource;
  /** Human-readable precedence steps, for `--explain` and audits. */
  readonly trace: readonly string[];
}

export interface RuntimeEvaluationInput {
  readonly context: RuntimeEvaluationContext;
  /** Value of the flag's legacy environment variable, read by the adapter. */
  readonly envValue?: string | undefined;
  readonly flag: CatalogFlag;
  /**
   * Every stored rule for this flag (rules for other flags are ignored), or
   * null when no rule snapshot is available. The environment fallback applies
   * only while no platform rule exists, so a flag that has been cut over to
   * the store must drop its environment variable and its `envFallback`.
   *
   * Only `null` means "no snapshot". Any other non-list value, including
   * `undefined`, is a malformed snapshot and turns every flag off, as does a
   * list holding a non-object entry. An adapter that has served a snapshot
   * must keep serving the last good one rather than pass `null`.
   */
  readonly rules: readonly RuntimeRule[] | null;
}

function isWellFormed(rule: RuntimeRule, flag: CatalogFlag) {
  return ruleShapeError(rule, flag.runtime?.scopes ?? []) === null;
}

/** Deterministic 0..9999 bucket for a flag, actor and workspace. */
export function rolloutBucket(
  key: string,
  userId: string | null,
  workspaceId: string | null
) {
  let hash = 2166136261;
  for (const character of JSON.stringify([
    key,
    userId ?? '',
    workspaceId ?? '',
  ])) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 10000;
}

function ruleDecides(
  rule: RuntimeRule,
  key: string,
  context: RuntimeEvaluationContext
): boolean {
  switch (rule.mode) {
    case 'on':
      return true;
    case 'off':
      return false;
    case 'staff':
      return context.isStaff;
    case 'rollout': {
      if (context.userId === null) return false;
      if (rule.allowUserIds?.includes(context.userId)) return true;
      if (
        context.workspaceId !== null &&
        rule.allowWorkspaceIds?.includes(context.workspaceId)
      ) {
        return true;
      }
      const pct = rule.percentage ?? 0;
      return (
        rolloutBucket(key, context.userId, context.workspaceId) < pct * 100
      );
    }
  }
}

/**
 * Evaluates one runtime flag. Precedence:
 *
 * 1. A malformed or duplicated rule set fails closed (`invalid-rules`).
 * 2. A platform `off` rule on a kill switch is final (`kill-switch`).
 * 3. The platform rule is a ceiling. While it is `off`, `staff` or `rollout`,
 *    a workspace or user rule can only narrow it: the result is the override
 *    AND the platform decision.
 * 4. One override decides inside that ceiling: a platform-admin user rule for
 *    the actor, otherwise the workspace rule for the actor's workspace. While
 *    the platform rule is `on` or absent, a platform-admin user rule decides
 *    alone. A workspace rule decides alone only when the flag declares
 *    `delegate: 'workspace'`; otherwise it narrows the environment fallback or
 *    the catalog default, so it cannot enable a flag that has no platform rule.
 * 5. Without an override: the platform rule, then the environment fallback
 *    (only while no platform rule is stored), then the catalog default.
 *
 * A self-controlled user rule can only turn an enabled result off; a user can
 * never grant a feature to themselves. Per-person access beyond a platform
 * `staff` or `rollout` rule goes through that rule (`staff` mode or its
 * allow-lists), not through a user rule.
 */
export function evaluateRuntimeFlag(
  input: RuntimeEvaluationInput
): RuntimeDecision {
  const { context, flag } = input;
  const trace: string[] = [];
  const fallbackDefault = flag.defaults.production === true;
  if (flag.family !== 'runtime' || flag.runtime === undefined) {
    trace.push('not a runtime flag: catalog default');
    return { enabled: fallbackDefault, source: 'default', trace };
  }

  // Any malformed or duplicated rule for this flag fails closed: the store
  // owns the flag, and an ambiguous rule set must never turn a feature on.
  if (input.rules !== null && !Array.isArray(input.rules)) {
    trace.push('rule snapshot is not a list');
    return { enabled: false, source: 'invalid-rules', trace };
  }
  if ((input.rules ?? []).some((rule) => typeof rule !== 'object' || !rule)) {
    trace.push('rule snapshot holds a non-object entry');
    return { enabled: false, source: 'invalid-rules', trace };
  }
  const rules = (input.rules ?? []).filter((rule) => rule.flagKey === flag.key);
  const identities = new Set<string>();
  for (const rule of rules) {
    if (!isWellFormed(rule, flag)) {
      trace.push(`invalid ${String(rule.scope)} rule`);
      return { enabled: false, source: 'invalid-rules', trace };
    }
    const identity = `${rule.scope}:${rule.subjectId ?? ''}`;
    if (identities.has(identity)) {
      trace.push(`duplicate ${rule.scope} rule`);
      return { enabled: false, source: 'invalid-rules', trace };
    }
    identities.add(identity);
  }
  const platform = rules.find((rule) => rule.scope === 'platform');
  const workspace =
    context.workspaceId === null
      ? undefined
      : rules.find(
          (rule) =>
            rule.scope === 'workspace' && rule.subjectId === context.workspaceId
        );
  const user =
    context.userId === null
      ? undefined
      : rules.find(
          (rule) => rule.scope === 'user' && rule.subjectId === context.userId
        );
  const { controllers, delegate, envFallback } = flag.runtime;

  const withSelfOptOut = (decision: RuntimeDecision): RuntimeDecision => {
    if (
      decision.enabled &&
      controllers.user === 'self' &&
      user?.mode === 'off'
    ) {
      return {
        enabled: false,
        source: 'self-opt-out',
        trace: [...decision.trace, 'user opted out'],
      };
    }
    return decision;
  };

  if (flag.kind === 'kill-switch' && platform?.mode === 'off') {
    trace.push('platform kill switch is off');
    return { enabled: false, source: 'kill-switch', trace };
  }

  // What the flag resolves to without a workspace or user rule.
  const base = (): RuntimeDecision => {
    if (platform) {
      return {
        enabled: ruleDecides(platform, flag.key, context),
        source: 'platform',
        trace: [...trace, `platform rule ${platform.mode}`],
      };
    }
    if (envFallback !== null && input.envValue !== undefined) {
      return {
        enabled: input.envValue === 'true',
        source: 'env-fallback',
        trace: [...trace, `no platform rule: ${envFallback} fallback`],
      };
    }
    return {
      enabled: fallbackDefault,
      source: 'default',
      trace: [...trace, 'catalog default'],
    };
  };

  const override =
    user && controllers.user === 'platform-admin'
      ? { rule: user, scope: 'user' as const, delegated: true }
      : workspace
        ? {
            rule: workspace,
            scope: 'workspace' as const,
            delegated: delegate === 'workspace',
          }
        : undefined;
  if (override === undefined) return withSelfOptOut(base());

  const step = `${override.scope} rule ${override.rule.mode}`;
  const ceilingApplies =
    (platform !== undefined && platform.mode !== 'on') || !override.delegated;
  const ceiling = ceilingApplies ? base() : undefined;
  if (ceiling && !ceiling.enabled) {
    return {
      enabled: false,
      source: ceiling.source,
      trace: [...ceiling.trace, `${step} is bounded by it`],
    };
  }
  return withSelfOptOut({
    enabled: ruleDecides(override.rule, flag.key, context),
    source: override.scope,
    trace: [...(ceiling?.trace ?? trace), step],
  });
}
