/**
 * Per-isolate view of the durable stop fence and per-family daily budgets in
 * `GuardControl`, with buffered usage reporting.
 */
import {
  ABUSE_GUARD_FAMILIES,
  type AbuseGuardFamily,
} from '@tuturuuu/utils/abuse-guard/protocol';
import { familyOpen, type GuardControl } from './objects';

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

function positiveInteger(value: string | undefined) {
  const parsed = Number(value?.trim());
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, MAX_BUDGET)
    : null;
}

export function dailyBudget(env: FenceEnv) {
  return (
    positiveInteger(env.ABUSE_GUARD_DAILY_OP_BUDGET) ?? DEFAULT_DAILY_BUDGET
  );
}

export function familyBudget(env: FenceEnv, family: AbuseGuardFamily) {
  for (const entry of (env.ABUSE_GUARD_FAMILY_BUDGETS ?? '').split(',')) {
    const [name, value] = entry.split('=');
    if (name?.trim() === family) {
      const explicit = positiveInteger(value);
      if (explicit) return explicit;
    }
  }
  return Math.max(
    1,
    Math.floor(dailyBudget(env) * FAMILY_BUDGET_SHARES[family])
  );
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
    const state = await controlStub(env).report(
      family,
      delta,
      familyBudget(env, family)
    );
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
