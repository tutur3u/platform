/**
 * Per-isolate view of the durable stop fence and per-family daily budgets in
 * `GuardControl`, with buffered usage reporting.
 */
import {
  ABUSE_GUARD_FAMILIES,
  type AbuseGuardFamily,
} from '@tuturuuu/utils/abuse-guard/protocol';
import { familyOpen } from './control-state';
import type { GuardControl } from './objects';

export interface FenceEnv {
  GUARD_CONTROL: DurableObjectNamespace<GuardControl>;
  /** Total admitted commands per UTC day, split across families. */
  ABUSE_GUARD_DAILY_OP_BUDGET?: string;
  /** Optional explicit split, e.g. `offline=600000,replay=100000`. */
  ABUSE_GUARD_FAMILY_BUDGETS?: string;
  /** Per-isolate fence cache; tests set 0 for immediate stops. */
  ABUSE_GUARD_CONTROL_CACHE_MS?: string;
}

const DEFAULT_DAILY_BUDGET = 1_000_000;
const MAX_BUDGET = 1_000_000_000;
const MAX_CONTROL_CACHE_MS = 5000;
/** Flush buffered usage to the control object after this many operations. */
const USAGE_FLUSH_OPS = 200;

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

let configErrorLogged = false;

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

function controlCacheMs(env: FenceEnv) {
  const parsed = Number(env.ABUSE_GUARD_CONTROL_CACHE_MS);
  return env.ABUSE_GUARD_CONTROL_CACHE_MS?.trim() && Number.isFinite(parsed)
    ? Math.min(MAX_CONTROL_CACHE_MS, Math.max(0, parsed))
    : MAX_CONTROL_CACHE_MS;
}

export function controlStub(env: FenceEnv) {
  return env.GUARD_CONTROL.get(env.GUARD_CONTROL.idFromName('control:v1'));
}

type FamilyFence = {
  stopped: boolean;
  checkedAt: number;
  pending: number;
  refreshing: Promise<void> | null;
};

const fences = new Map<AbuseGuardFamily, FamilyFence>();

function fenceOf(family: AbuseGuardFamily) {
  let fence = fences.get(family);
  if (!fence) {
    fence = {
      stopped: false,
      checkedAt: Number.NEGATIVE_INFINITY,
      pending: 0,
      refreshing: null,
    };
    fences.set(family, fence);
  }
  return fence;
}

async function refreshFence(env: FenceEnv, family: AbuseGuardFamily) {
  const fence = fenceOf(family);
  const delta = fence.pending;
  fence.pending = 0;
  try {
    const budgets = resolveFamilyBudgets(env);
    if (!budgets) {
      if (!configErrorLogged) {
        configErrorLogged = true;
        // Fixed text: the configuration values are never logged.
        console.error(
          '[abuse-guard] invalid budget configuration; every RPC returns 503'
        );
      }
      throw new GuardConfigError('invalid abuse-guard budget configuration');
    }
    const state = await controlStub(env).report(family, delta, budgets[family]);
    fence.stopped = !familyOpen(state, family);
    fence.checkedAt = Date.now();
  } catch (error) {
    fence.pending += delta;
    // Unknown fence state is treated as stopped until a refresh succeeds.
    fence.checkedAt = Number.NEGATIVE_INFINITY;
    throw error;
  }
}

/**
 * Returns whether `ops` may run for `family`. Previously admitted usage is
 * flushed before deciding, and this request's operations are counted only
 * once admitted, so rejected requests are never billed.
 */
export async function admit(
  env: FenceEnv,
  family: AbuseGuardFamily,
  ops: number
): Promise<'open' | 'stopped'> {
  const fence = fenceOf(family);
  const stale = Date.now() - fence.checkedAt >= controlCacheMs(env);
  if (stale || fence.pending + ops >= USAGE_FLUSH_OPS) {
    fence.refreshing ??= refreshFence(env, family).finally(() => {
      fence.refreshing = null;
    });
    await fence.refreshing;
  }
  if (fence.stopped) return 'stopped';
  fence.pending += ops;
  return 'open';
}

/** Applies an operator stop or resume to this isolate immediately. */
export function applyOperatorStop(stopped: boolean) {
  for (const family of ABUSE_GUARD_FAMILIES) {
    const fence = fenceOf(family);
    fence.stopped = stopped;
    fence.checkedAt = Date.now();
  }
}
