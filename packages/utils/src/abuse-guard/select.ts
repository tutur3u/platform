/**
 * Chooses the abuse-guard backend for one caller family.
 *
 * - `durable-object`: the family is named in ABUSE_GUARD_FAMILIES and the
 *   store is configured (HTTP env, or a native Worker's injected binding).
 * - `legacy`: keep today's Upstash path (or its missing-store behavior).
 *   This is the default for every family.
 * - `off`: ABUSE_GUARD_BACKEND=off. Callers treat the store as unavailable and
 *   apply their own fail policy, without falling back to Upstash.
 */
import {
  type AbuseGuardBinding,
  type AbuseGuardClient,
  type AbuseGuardTransport,
  createAbuseGuardClient,
  createBindingGuardTransport,
  createHttpGuardTransport,
} from './client';
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

/** Secrets and peppers shorter than this are treated as unconfigured. */
export const ABUSE_GUARD_MIN_SECRET_LENGTH = 32;
export const ABUSE_GUARD_DEFAULT_TIMEOUT_MS = 750;

export function parseAbuseGuardFamilies(value: string | undefined) {
  const known = new Set<string>(ABUSE_GUARD_FAMILIES);
  return new Set(
    (value ?? '')
      .split(',')
      .map((family) => family.trim())
      .filter((family): family is AbuseGuardFamily => known.has(family))
  );
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
  return trimmed && trimmed.length >= ABUSE_GUARD_MIN_SECRET_LENGTH
    ? trimmed
    : null;
}

function validUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const loopback =
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost' ||
      url.hostname === '[::1]';
    // Plain HTTP is accepted only for local Wrangler/workerd verification.
    return url.protocol === 'https:' || (url.protocol === 'http:' && loopback)
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

type RuntimeOverride = {
  transport: AbuseGuardTransport;
  pepper: string;
  families: ReadonlySet<AbuseGuardFamily>;
};

let runtimeOverride: RuntimeOverride | null = null;
const clientCache = new Map<string, AbuseGuardClient>();

/**
 * Native Workers inject their `ABUSE_GUARD` service binding at the framework
 * adapter. Pass `null` to clear it (tests, or a binding removed at runtime).
 */
export function configureAbuseGuardRuntime(
  input: {
    binding: AbuseGuardBinding;
    pepper: string | undefined;
    families: string | undefined;
    timeoutMs?: string;
  } | null
) {
  clientCache.clear();
  const pepper = strong(input?.pepper);
  runtimeOverride =
    input && pepper
      ? {
          transport: createBindingGuardTransport(
            input.binding,
            parseAbuseGuardTimeout(input.timeoutMs)
          ),
          pepper,
          families: parseAbuseGuardFamilies(input.families),
        }
      : null;
}

function processEnv(): AbuseGuardEnv {
  return typeof process === 'undefined'
    ? {}
    : (process.env as unknown as AbuseGuardEnv);
}

export function selectAbuseGuard(
  family: AbuseGuardFamily,
  env: AbuseGuardEnv = processEnv()
): AbuseGuardSelection {
  const backend = env.ABUSE_GUARD_BACKEND?.trim().toLowerCase();
  if (backend === 'off') return { kind: 'off' };
  if (backend === 'upstash') return { kind: 'legacy' };

  if (runtimeOverride) {
    if (!runtimeOverride.families.has(family)) return { kind: 'legacy' };
    const cacheKey = `binding:${family}`;
    let client = clientCache.get(cacheKey);
    if (!client) {
      client = createAbuseGuardClient({
        family,
        pepper: runtimeOverride.pepper,
        transport: runtimeOverride.transport,
      });
      clientCache.set(cacheKey, client);
    }
    return { kind: 'durable-object', client };
  }

  if (!parseAbuseGuardFamilies(env.ABUSE_GUARD_FAMILIES).has(family)) {
    return { kind: 'legacy' };
  }
  const url = validUrl(env.ABUSE_GUARD_URL);
  const secret = strong(env.ABUSE_GUARD_SECRET);
  const pepper = strong(env.ABUSE_GUARD_KEY_PEPPER);
  if (!url || !secret || !pepper) {
    // A family explicitly enabled for a broken configuration must not fall
    // back to another store silently; callers apply their failure policy.
    return backend === 'durable-object' ? { kind: 'off' } : { kind: 'legacy' };
  }

  const timeoutMs = parseAbuseGuardTimeout(env.ABUSE_GUARD_TIMEOUT_MS);
  const cacheKey = `http:${family}:${url}:${timeoutMs}:${secret}:${pepper}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    if (clientCache.size >= 16) clientCache.clear();
    client = createAbuseGuardClient({
      family,
      pepper,
      transport: createHttpGuardTransport({ url, secret, timeoutMs }),
    });
    clientCache.set(cacheKey, client);
  }
  return { kind: 'durable-object', client };
}
