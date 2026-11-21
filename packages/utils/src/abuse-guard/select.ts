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
    return family === 'replay'
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
  /** Circuit breakers keyed by backend target (`binding`, or the HTTP origin). */
  breakers?: Map<string, GuardBreakerState>;
};

/** Bound on distinct breaker targets per isolate. */
const MAX_BREAKER_TARGETS = 8;

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

/** The isolate-wide breaker for one backend target, shared by every copy. */
function breakerFor(target: string): GuardBreakerState {
  const state = runtimeState();
  state.breakers ??= new Map();
  let breaker = state.breakers.get(target);
  if (!breaker) {
    if (state.breakers.size >= MAX_BREAKER_TARGETS) state.breakers.clear();
    breaker = createGuardBreakerState();
    state.breakers.set(target, breaker);
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
  state.input = input;
  state.generation += 1;
  // A new binding is a new connection; do not carry an open circuit over.
  state.breakers?.delete('binding');
  if (!input) {
    state.override = null;
    return;
  }
  const pepper = strong(input.pepper);
  state.override = {
    families: parseAbuseGuardFamilies(input.families),
    usable: pepper
      ? {
          transport: (family) =>
            withGuardBreaker(
              createBindingGuardTransport(
                input.binding,
                parseAbuseGuardTimeout(input.timeoutMs, family)
              ),
              breakerFor('binding'),
              'binding'
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
            breakerFor(`http:${url}`),
            'http'
          ),
        })
    ),
  };
}
