import { createExpiringMap } from '@tuturuuu/utils/abuse-guard/local-cache';
import {
  type FairIdentity,
  type FairAdmission,
  fairIdentityKeys,
} from './fair-admission';
/**
 * Per-isolate view of the durable stop fence and per-family daily budgets in
 * `GuardControl`, with durable reservation before execution.
 */
import {
  ABUSE_GUARD_FAMILIES,
  type AbuseGuardFamily,
} from '@tuturuuu/utils/abuse-guard/protocol';
import type { GuardControl } from './objects';

export interface FenceEnv {
  GUARD_CONTROL: DurableObjectNamespace<GuardControl>;
  /** Total admitted commands per UTC day, split across families. */
  ABUSE_GUARD_DAILY_OP_BUDGET?: string;
  /** Optional explicit split, e.g. `offline=600000,replay=100000`. */
  ABUSE_GUARD_FAMILY_BUDGETS?: string;
  /** Legacy setting; admission now always reserves durably. */
  ABUSE_GUARD_CONTROL_CACHE_MS?: string;
}

const DEFAULT_DAILY_BUDGET = 1_000_000;
const MAX_BUDGET = 1_000_000_000;

/**
 * Default split of the total budget. Unauthenticated offline traffic gets the
 * largest share but cannot spend another family's allowance.
 */
export const FAMILY_BUDGET_SHARES: Record<AbuseGuardFamily, number> = {
  offline: 0.6,
  proxy: 0.2,
  replay: 0.1,
  password: 0.1,
};

/** Thrown when the budget configuration is invalid; RPCs return 503. */
export class GuardConfigError extends Error {}

function strictPositiveInteger(value: string) {
  if (!/^\d{1,10}$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= MAX_BUDGET
    ? parsed
    : null;
}

export type FamilyBudgets = Record<AbuseGuardFamily, number>;

const budgetCache = new Map<string, FamilyBudgets | null>();

/**
 * Resolves every family's daily budget, or null when the configuration is
 * invalid: a malformed total, an unknown or duplicate family, a malformed
 * value, or explicit entries plus implied shares above the total. Nothing
 * silently falls back to a default once a value is set.
 */
export function resolveFamilyBudgets(
  env: Pick<
    FenceEnv,
    'ABUSE_GUARD_DAILY_OP_BUDGET' | 'ABUSE_GUARD_FAMILY_BUDGETS'
  >
): FamilyBudgets | null {
  const totalSource = env.ABUSE_GUARD_DAILY_OP_BUDGET ?? '';
  const splitSource = env.ABUSE_GUARD_FAMILY_BUDGETS ?? '';
  // A set but blank value is malformed; only an absent or empty one defaults.
  if (
    (totalSource !== '' && !totalSource.trim()) ||
    (splitSource !== '' && !splitSource.trim())
  ) {
    return null;
  }
  const totalRaw = totalSource.trim();
  const splitRaw = splitSource.trim();
  const cacheKey = `${totalRaw}|${splitRaw}`;
  if (budgetCache.has(cacheKey)) return budgetCache.get(cacheKey) ?? null;

  const resolve = (): FamilyBudgets | null => {
    const total = totalRaw
      ? strictPositiveInteger(totalRaw)
      : DEFAULT_DAILY_BUDGET;
    if (total === null) return null;
    const known = new Set<string>(ABUSE_GUARD_FAMILIES);
    const explicit = new Map<AbuseGuardFamily, number>();
    if (splitRaw) {
      for (const entry of splitRaw.split(',')) {
        const match = /^\s*([a-z]+)\s*=\s*(\S+)\s*$/u.exec(entry);
        if (!match) return null;
        const [, name = '', raw = ''] = match;
        if (!known.has(name) || explicit.has(name as AbuseGuardFamily)) {
          return null;
        }
        const value = strictPositiveInteger(raw);
        if (value === null) return null;
        explicit.set(name as AbuseGuardFamily, value);
      }
    }
    const budgets = {} as FamilyBudgets;
    let sum = 0;
    for (const family of ABUSE_GUARD_FAMILIES) {
      const budget =
        explicit.get(family) ??
        Math.floor(total * FAMILY_BUDGET_SHARES[family]);
      if (budget < 1) return null;
      budgets[family] = budget;
      sum += budget;
    }
    return sum <= total ? budgets : null;
  };

  const budgets = resolve();
  if (budgetCache.size >= 16) budgetCache.clear();
  budgetCache.set(cacheKey, budgets);
  return budgets;
}

export function controlStub(env: FenceEnv) {
  return env.GUARD_CONTROL.get(env.GUARD_CONTROL.idFromName('control:v1'));
}

/** Reserve before execution. Interrupted or skipped work remains charged. */
export async function admit(
  env: FenceEnv,
  family: AbuseGuardFamily,
  ops: number
): Promise<'open' | 'stopped'> {
  const budgets = resolveFamilyBudgets(env);
  if (!budgets)
    throw new GuardConfigError('invalid abuse-guard budget configuration');
  return controlStub(env).reserve(family, ops, budgets[family]);
}
/** A cache miss always rechecks durable quotas; eviction/restart grants nothing. */
export function createFairAdmissionGate(maxEntries = 10_000) {
  const denials = createExpiringMap<number>(maxEntries);
  return async (
    env: FenceEnv,
    family: AbuseGuardFamily,
    identity: FairIdentity,
    ops: number
  ): Promise<FairAdmission> => {
    const budgets = resolveFamilyBudgets(env);
    if (!budgets)
      throw new GuardConfigError('invalid abuse-guard budget configuration');
    const now = Date.now();
    const keys = fairIdentityKeys(family, identity);
    const cached = keys.find((key) => denials.get(key, now) !== undefined);
    if (cached)
      return {
        kind: 'limited',
        keys: [cached],
        resetAt: denials.get(cached, now) ?? now,
      };
    const result = await controlStub(env).admitFair(
      family,
      identity,
      ops,
      budgets[family]
    );
    if (result.kind === 'limited') {
      for (const key of result.keys)
        denials.set(key, result.resetAt, result.resetAt);
    }
    return result;
  };
}

export const admitFair = createFairAdmissionGate();
