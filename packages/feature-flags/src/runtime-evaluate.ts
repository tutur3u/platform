import type { CatalogFlag } from './lifecycle.mjs';
import type { RuntimeRuleScope } from './runtime-definition.mjs';

export type RuntimeRuleMode = 'on' | 'off' | 'staff' | 'rollout';

/** One stored rule for a runtime flag. `subjectId` is null at platform scope. */
export interface RuntimeRule {
  readonly flagKey: string;
  readonly scope: RuntimeRuleScope;
  readonly subjectId: string | null;
  readonly mode: RuntimeRuleMode;
  /** Integer 0 to 100; used by `rollout`. */
  readonly percentage?: number;
  readonly allowWorkspaceIds?: readonly string[];
  readonly allowUserIds?: readonly string[];
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
   */
  readonly rules: readonly RuntimeRule[] | null;
}

const MODES: readonly string[] = ['on', 'off', 'staff', 'rollout'];

function isIdList(value: unknown) {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((id) => typeof id === 'string'))
  );
}

function isWellFormed(rule: RuntimeRule, flag: CatalogFlag) {
  const scopes = flag.runtime?.scopes ?? [];
  if (!scopes.includes(rule.scope)) return false;
  if (!MODES.includes(rule.mode)) return false;
  if (rule.scope === 'platform') {
    if (rule.subjectId !== null) return false;
  } else if (typeof rule.subjectId !== 'string' || rule.subjectId === '') {
    return false;
  }
  // A user rule is a per-person override: on or off only.
  if (rule.scope === 'user' && rule.mode !== 'on' && rule.mode !== 'off') {
    return false;
  }
  if (!isIdList(rule.allowUserIds) || !isIdList(rule.allowWorkspaceIds)) {
    return false;
  }
  if (rule.mode === 'rollout') {
    const pct = rule.percentage ?? 0;
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) return false;
  }
  return true;
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
 * Evaluates one runtime flag. Precedence: an invalid rule set fails closed;
 * a platform `off` on a kill switch, or above a workspace-admin controlled
 * rule, is final; then a platform-controlled user rule, the workspace rule,
 * the platform rule, the environment fallback (only while no platform rule is
 * stored) and the catalog default. A self-controlled user rule can only turn
 * the result off; a user can never grant a feature to themselves.
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
  const { controllers, envFallback } = flag.runtime;

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
  if (user && controllers.user === 'platform-admin') {
    const enabled = ruleDecides(user, flag.key, context);
    trace.push(`user rule ${user.mode}`);
    return { enabled, source: 'user', trace };
  }
  if (workspace) {
    // A workspace admin may opt in only where the platform has not turned
    // the feature off.
    if (
      controllers.workspace === 'workspace-admin' &&
      platform?.mode === 'off'
    ) {
      trace.push('platform rule off overrides the workspace-admin rule');
      return { enabled: false, source: 'platform', trace };
    }
    const enabled = ruleDecides(workspace, flag.key, context);
    trace.push(`workspace rule ${workspace.mode}`);
    return withSelfOptOut({ enabled, source: 'workspace', trace });
  }
  if (platform) {
    const enabled = ruleDecides(platform, flag.key, context);
    trace.push(`platform rule ${platform.mode}`);
    return withSelfOptOut({ enabled, source: 'platform', trace });
  }
  if (envFallback !== null && input.envValue !== undefined) {
    const enabled = input.envValue === 'true';
    trace.push(`no platform rule: ${envFallback} fallback`);
    return withSelfOptOut({ enabled, source: 'env-fallback', trace });
  }
  trace.push('catalog default');
  return { enabled: fallbackDefault, source: 'default', trace };
}
