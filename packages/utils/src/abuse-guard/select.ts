/**
 * Chooses the abuse-guard backend for one caller family.
 *
 * - `durable-object`: the family is named in ABUSE_GUARD_FAMILIES and the
 *   store is configured (HTTP env, or a native Worker's injected binding).
 * - `legacy`: keep today's Upstash path (or its missing-store behavior).
 *   This is the default for every unassigned family.
 * - `off`: an assigned family under ABUSE_GUARD_BACKEND=off, or whose
 *   configuration is incomplete. Callers treat the store as unavailable and apply their own
 *   fail policy, without falling back to Upstash.
 */
import {
  type AbuseGuardBinding,
  type AbuseGuardClient,
  type AbuseGuardTransport,
  createAbuseGuardClient,
  createBindingGuardTransport,
  createHttpGuardTransport,
} from './client';
import {
  createGuardBreakerState,
  type GuardBreakerState,
  withGuardBreaker,
} from './breaker';
import { isStrongGuardSecret, resolveGuardOrigin } from './crypto';
import { safeErrorFields } from '../log-safety';
import { ABUSE_GUARD_FAMILIES, type AbuseGuardFamily } from './protocol';

export type AbuseGuardEnv = Partial<
  Record<
    | 'ABUSE_GUARD_BACKEND'
    | 'ABUSE_GUARD_URL'
    | 'ABUSE_GUARD_SECRET'
    | 'ABUSE_GUARD_KEY_PEPPER'
    | 'ABUSE_GUARD_FAMILIES'
    | 'ABUSE_GUARD_TIMEOUT_MS',
    string | undefined
  >
>;

export type AbuseGuardSelection =
  | { kind: 'durable-object'; client: AbuseGuardClient }
  | { kind: 'legacy' }
  | { kind: 'off' };

export const ABUSE_GUARD_DEFAULT_TIMEOUT_MS = 750;
/** Fail-closed replay calls allow cold-object admission, bounded to two seconds. */
export const ABUSE_GUARD_REPLAY_TIMEOUT_MS = 2000;

/**
 * Families whose callers refuse the request when the store cannot answer
 * (replay admission, the paid Meet AI limiter). A cold Durable Object can take
 * longer than the default to answer its first call, and a timeout there turns
 * into a user-facing refusal, so these families allow the same two-second
 * bound as replay. Fail-open families keep the shorter default.
 */
const FAIL_CLOSED_FAMILIES: ReadonlySet<AbuseGuardFamily> = new Set([
  'replay',
  'meet',
]);

const warnedFamilyNames = new Set<string>();

/**
 * Parses a family list. Unknown names (typos, wrong case) are ignored, so the
 * family stays on its legacy path; each one is reported once per process.
 */
export function parseAbuseGuardFamilies(value: string | undefined) {
  const known = new Set<string>(ABUSE_GUARD_FAMILIES);
  const families = new Set<AbuseGuardFamily>();
  for (const raw of (value ?? '').split(',')) {
    const name = raw.trim();
    if (!name) continue;
    if (known.has(name)) {
      families.add(name as AbuseGuardFamily);
    } else if (!warnedFamilyNames.has(name) && warnedFamilyNames.size < 32) {
      warnedFamilyNames.add(name);
      console.warn(
        `[abuse-guard] Ignoring unknown family "${name.slice(0, 32)}"; expected one of ${ABUSE_GUARD_FAMILIES.join(', ')}`
      );
    }
  }
  return families;
}

export function parseAbuseGuardTimeout(
  value: string | undefined,
  family?: AbuseGuardFamily
) {
  const parsed = Number(value);
  if (!value?.trim() || !Number.isFinite(parsed)) {
    return family && FAIL_CLOSED_FAMILIES.has(family)
      ? ABUSE_GUARD_REPLAY_TIMEOUT_MS
      : ABUSE_GUARD_DEFAULT_TIMEOUT_MS;
  }
  return Math.min(2000, Math.max(100, Math.trunc(parsed)));
}

function strong(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && isStrongGuardSecret(trimmed) ? trimmed : null;
}

type RuntimeInput = {
  binding: AbuseGuardBinding;
  pepper: string | undefined;
  families: string | undefined;
  timeoutMs?: string;
};

type RuntimeOverride = {
  families: ReadonlySet<AbuseGuardFamily>;
  /** Null when the injected configuration is unusable: assigned families are off. */
  usable: {
    transport: (family: AbuseGuardFamily) => AbuseGuardTransport;
    pepper: string;
  } | null;
};

type RuntimeState = {
  input: RuntimeInput | null;
  override: RuntimeOverride | null;
  /** Bumped on every change so each bundled copy drops its cached clients. */
  generation: number;
  /**
   * Circuit breakers keyed by `<target>|<family>`, where the target is
   * `binding` or `http:<origin>`. Per family, so one family's timeouts cannot
   * open the circuit for the others on the same target.
   */
  breakers?: Map<string, GuardBreakerState>;
};

/**
 * Bound on breaker entries per isolate. Families are a small fixed set
 * (`ABUSE_GUARD_FAMILIES`, 8 today) and an isolate normally has one or two
 * targets, so 32 covers four targets for every family. Past the cap the map
 * is cleared, which only forgets failure counts (closes circuits).
 */
const MAX_BREAKER_ENTRIES = 32;
const BINDING_TARGET = 'binding';

function breakerKey(target: string, family: AbuseGuardFamily) {
  return `${target}|${family}`;
}

/**
 * One override per isolate, shared by every bundled copy of this module. A
 * Vite RSC Worker bundles its `ssr` entry (which installs the binding) and its
 * `rsc` route handlers as separate module graphs; module-local state would
 * leave route-side callers of an assigned family `off`.
 */
const RUNTIME_STATE_KEY = Symbol.for('tuturuuu.abuse-guard.runtime');

function runtimeState(): RuntimeState {
  const holder = globalThis as typeof globalThis & {
    [RUNTIME_STATE_KEY]?: RuntimeState;
  };
  let state = holder[RUNTIME_STATE_KEY];
  if (!state) {
    state = { input: null, override: null, generation: 0 };
    holder[RUNTIME_STATE_KEY] = state;
  }
  return state;
}

/**
 * The isolate-wide breaker for one (backend target, family), shared by every
 * bundled copy of this module.
 */
function breakerFor(
  target: string,
  family: AbuseGuardFamily
): GuardBreakerState {
  const state = runtimeState();
  state.breakers ??= new Map();
  const key = breakerKey(target, family);
  let breaker = state.breakers.get(key);
  if (!breaker) {
    if (state.breakers.size >= MAX_BREAKER_ENTRIES) state.breakers.clear();
    breaker = createGuardBreakerState();
    state.breakers.set(key, breaker);
  }
  return breaker;
}

const clientCache = new Map<string, AbuseGuardClient>();
let clientCacheGeneration = -1;

/**
 * Native Workers inject their `ABUSE_GUARD` service binding at the framework
 * adapter, once per request; an unchanged input is a no-op. Pass `null` to
 * clear it (tests, or a binding removed at runtime).
 */
export function configureAbuseGuardRuntime(input: RuntimeInput | null) {
  try {
    installRuntimeInput(input);
  } catch (error) {
    failRuntimeInputClosed(input, error);
  }
}

let configureFailureReported = false;
let failedFamiliesKey: string | null = null;

/**
 * The families a failed configuration assigns. A missing list assigns none;
 * a list that is present but unreadable or not a string (e.g. a JSON var)
 * assigns every family, so nothing intended for the store falls back.
 */
function failedFamilies(input: RuntimeInput | null) {
  try {
    const value: unknown = input?.families;
    if (value === undefined || value === null) {
      return new Set<AbuseGuardFamily>();
    }
    if (typeof value === 'string') return parseAbuseGuardFamilies(value);
  } catch {
    // Unreadable: treated as assigning every family.
  }
  return new Set<AbuseGuardFamily>(ABUSE_GUARD_FAMILIES);
}

/**
 * Configuration runs before routing on every request of a native Worker, so a
 * failure here must never become a 500 on every route. Families the input
 * assigns turn `off` (callers apply their own fail policy; never legacy, so a
 * consumed token cannot be replayed against a fresh store). Unassigned
 * families keep their legacy path. Reported once per failure episode,
 * without the message or binding details.
 */
function failRuntimeInputClosed(input: RuntimeInput | null, error: unknown) {
  const state = runtimeState();
  const families = failedFamilies(input);
  const key = [...families].sort().join(',');
  // A repeated identical failure keeps the state as is: no per-request churn.
  if (state.input === null && failedFamiliesKey === key) return;
  failedFamiliesKey = key;
  state.input = null;
  state.generation += 1;
  state.override = families.size > 0 ? { families, usable: null } : null;
  if (!configureFailureReported) {
    configureFailureReported = true;
    try {
      console.error(
        `[ALERT][abuse-guard] SR-951 ${JSON.stringify({
          alert: 'abuse-guard-configure-failed',
          severity: 'critical',
          families: [...families].sort(),
          error: safeErrorFields(error),
        })}`
      );
    } catch {
      // Reporting must never turn a contained failure into a 500.
    }
  }
}

function installRuntimeInput(input: RuntimeInput | null) {
  const state = runtimeState();
  const current = state.input;
  if (
    input &&
    current &&
    input.binding === current.binding &&
    input.pepper === current.pepper &&
    input.families === current.families &&
    input.timeoutMs === current.timeoutMs
  ) {
    return;
  }
  // Derive everything before touching shared state, so a throw never leaves
  // a half-installed input; the failure path then turns assigned families off.
  const override = input ? deriveOverride(input) : null;
  failedFamiliesKey = null;
  // A recovered isolate reports its next, possibly different, failure.
  configureFailureReported = false;
  state.input = input;
  state.generation += 1;
  // A new binding is a new connection; do not carry an open circuit over.
  for (const family of ABUSE_GUARD_FAMILIES) {
    state.breakers?.delete(breakerKey(BINDING_TARGET, family));
  }
  state.override = override;
}

function deriveOverride(input: RuntimeInput): RuntimeOverride | null {
  const families = parseAbuseGuardFamilies(input.families);
  // No assigned family: the binding is never used, so nothing derives from it.
  if (families.size === 0) return null;
  const pepper = strong(input.pepper);
  const { binding, timeoutMs } = input;
  return {
    families,
    usable: pepper
      ? {
          transport: (family) =>
            withGuardBreaker(
              createBindingGuardTransport(
                binding,
                parseAbuseGuardTimeout(timeoutMs, family)
              ),
              breakerFor(BINDING_TARGET, family),
              { target: BINDING_TARGET, family }
            ),
          pepper,
        }
      : null,
  };
}

function processEnv(): AbuseGuardEnv {
  return typeof process === 'undefined'
    ? {}
    : (process.env as unknown as AbuseGuardEnv);
}

function cachedClient(
  cacheKey: string,
  create: () => AbuseGuardClient
): AbuseGuardClient {
  const { generation } = runtimeState();
  if (clientCacheGeneration !== generation) {
    clientCache.clear();
    clientCacheGeneration = generation;
  }
  let client = clientCache.get(cacheKey);
  if (!client) {
    if (clientCache.size >= 16) clientCache.clear();
    client = create();
    clientCache.set(cacheKey, client);
  }
  return client;
}

/**
 * Whether `family` is assigned to the Durable Object store (served, or `off`
 * because its assigned configuration is unusable). Callers whose legacy policy
 * fails open use this to fail closed instead once the store owns the family,
 * so exhausting the store's budget can never switch their protection off.
 */
export function isAbuseGuardFamilyAssigned(
  family: AbuseGuardFamily,
  env?: AbuseGuardEnv
) {
  return selectAbuseGuard(family, env).kind !== 'legacy';
}

/**
 * Once a family is assigned to the Durable Object store, an incomplete or
 * invalid configuration reports `off` and never falls back to the legacy
 * store: a fresh legacy store would forget consumed tokens and spent limits.
 * `legacy` is only for an unassigned family or ABUSE_GUARD_BACKEND=upstash.
 */
export function selectAbuseGuard(
  family: AbuseGuardFamily,
  env: AbuseGuardEnv = processEnv()
): AbuseGuardSelection {
  const backend = env.ABUSE_GUARD_BACKEND?.trim().toLowerCase();
  if (backend === 'upstash') return { kind: 'legacy' };
  const runtimeOverride = runtimeState().override;
  const assigned =
    runtimeOverride?.families.has(family) === true ||
    parseAbuseGuardFamilies(env.ABUSE_GUARD_FAMILIES).has(family);
  // `off` switches only assigned families off; unassigned ones keep legacy.
  if (!assigned) return { kind: 'legacy' };
  if (backend === 'off') return { kind: 'off' };

  if (runtimeOverride?.families.has(family)) {
    const usable = runtimeOverride.usable;
    if (!usable) return { kind: 'off' };
    return {
      kind: 'durable-object',
      client: cachedClient(`binding:${family}`, () =>
        createAbuseGuardClient({
          family,
          pepper: usable.pepper,
          transport: usable.transport(family),
        })
      ),
    };
  }

  const url = resolveGuardOrigin(env.ABUSE_GUARD_URL);
  const secret = strong(env.ABUSE_GUARD_SECRET);
  const pepper = strong(env.ABUSE_GUARD_KEY_PEPPER);
  if (!url || !secret || !pepper) return { kind: 'off' };

  const timeoutMs = parseAbuseGuardTimeout(env.ABUSE_GUARD_TIMEOUT_MS, family);
  return {
    kind: 'durable-object',
    client: cachedClient(
      `http:${family}:${url}:${timeoutMs}:${secret}:${pepper}`,
      () =>
        createAbuseGuardClient({
          family,
          pepper,
          transport: withGuardBreaker(
            createHttpGuardTransport({ url, secret, timeoutMs }),
            breakerFor(`http:${url}`, family),
            { target: 'http', family }
          ),
        })
    ),
  };
}
