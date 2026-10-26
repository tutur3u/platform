/**
 * Chooses the abuse-guard backend for one caller family.
 *
 * - `durable-object`: the family is named in ABUSE_GUARD_FAMILIES and the
 *   store is configured (HTTP env, or a native Worker's injected binding).
 * - `legacy`: keep today's Upstash path (or its missing-store behavior).
 *   This is the default for every unassigned family.
 * - `off`: ABUSE_GUARD_BACKEND=off, or an assigned family whose configuration
 *   is incomplete. Callers treat the store as unavailable and apply their own
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

export function parseAbuseGuardTimeout(value: string | undefined) {
  const parsed = Number(value);
  if (!value?.trim() || !Number.isFinite(parsed)) {
    return ABUSE_GUARD_DEFAULT_TIMEOUT_MS;
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
  usable: { transport: AbuseGuardTransport; pepper: string } | null;
};

let runtimeOverride: RuntimeOverride | null = null;
let runtimeInput: RuntimeInput | null = null;
const clientCache = new Map<string, AbuseGuardClient>();

/**
 * Native Workers inject their `ABUSE_GUARD` service binding at the framework
 * adapter, once per request; an unchanged input is a no-op. Pass `null` to
 * clear it (tests, or a binding removed at runtime).
 */
export function configureAbuseGuardRuntime(input: RuntimeInput | null) {
  if (
    input &&
    runtimeInput &&
    input.binding === runtimeInput.binding &&
    input.pepper === runtimeInput.pepper &&
    input.families === runtimeInput.families &&
    input.timeoutMs === runtimeInput.timeoutMs
  ) {
    return;
  }
  runtimeInput = input;
  clientCache.clear();
  if (!input) {
    runtimeOverride = null;
    return;
  }
  const pepper = strong(input.pepper);
  runtimeOverride = {
    families: parseAbuseGuardFamilies(input.families),
    usable: pepper
      ? {
          transport: createBindingGuardTransport(
            input.binding,
            parseAbuseGuardTimeout(input.timeoutMs)
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
  let client = clientCache.get(cacheKey);
  if (!client) {
    if (clientCache.size >= 16) clientCache.clear();
    client = create();
    clientCache.set(cacheKey, client);
  }
  return client;
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
  if (backend === 'off') return { kind: 'off' };
  if (backend === 'upstash') return { kind: 'legacy' };

  if (runtimeOverride?.families.has(family)) {
    const usable = runtimeOverride.usable;
    if (!usable) return { kind: 'off' };
    return {
      kind: 'durable-object',
      client: cachedClient(`binding:${family}`, () =>
        createAbuseGuardClient({
          family,
          pepper: usable.pepper,
          transport: usable.transport,
        })
      ),
    };
  }

  if (!parseAbuseGuardFamilies(env.ABUSE_GUARD_FAMILIES).has(family)) {
    return { kind: 'legacy' };
  }
  const url = resolveGuardOrigin(env.ABUSE_GUARD_URL);
  const secret = strong(env.ABUSE_GUARD_SECRET);
  const pepper = strong(env.ABUSE_GUARD_KEY_PEPPER);
  if (!url || !secret || !pepper) return { kind: 'off' };

  const timeoutMs = parseAbuseGuardTimeout(env.ABUSE_GUARD_TIMEOUT_MS);
  return {
    kind: 'durable-object',
    client: cachedClient(
      `http:${family}:${url}:${timeoutMs}:${secret}:${pepper}`,
      () =>
        createAbuseGuardClient({
          family,
          pepper,
          transport: createHttpGuardTransport({ url, secret, timeoutMs }),
        })
    ),
  };
}
