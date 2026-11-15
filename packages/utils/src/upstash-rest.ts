import type { Redis } from '@upstash/redis';
import type { GuardFairnessInput } from './abuse-guard/client';
import type { AbuseGuardFamily } from './abuse-guard/protocol';
import { createGuardRedisView } from './abuse-guard/redis-view';
import { selectAbuseGuard } from './abuse-guard/select';

export type UpstashRestRedisClient = Pick<
  Redis,
  | 'decr'
  | 'del'
  | 'eval'
  | 'expire'
  | 'get'
  | 'incr'
  | 'mget'
  | 'scan'
  | 'set'
  | 'ttl'
>;
export type UpstashRatelimitRedisClient = Pick<
  Redis,
  'eval' | 'evalsha' | 'get' | 'set'
>;

/** Fixed, value-free reasons a guard family is not enforcing as configured. */
export type GuardStoreProblem =
  | 'legacy-without-pair'
  | 'selector-off'
  | 'invalid-guard-config'
  | 'invalid-cutover';

const reportedGuardProblems = new Set<string>();

/**
 * Static service identity for the alert: a configured TUTURUUU_SERVICE_NAME,
 * else the platform's per-deployment production host. Never request data
 * (Host or X-Forwarded-Host), so a spoofed header can't steer or suppress
 * paging. Anything not matching the fixed shape becomes `unknown`.
 */
type GuardAlertServiceEnv = Partial<
  Record<'TUTURUUU_SERVICE_NAME' | 'VERCEL_PROJECT_PRODUCTION_URL', string>
>;

export function guardAlertServiceName(env: GuardAlertServiceEnv = process.env) {
  const configured = env.TUTURUUU_SERVICE_NAME?.trim().toLowerCase();
  const host = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, '')
    .split('/')[0];
  const name = configured || host || '';
  return /^[a-z0-9][a-z0-9.-]{0,63}$/u.test(name) ? name : 'unknown';
}

/**
 * SR-951 (D186-FP): a guard family that is not enforcing as configured.
 * Fail-open families (password, MFA, OTP, proxy, offline) silently stop
 * enforcing; fail-closed `replay` becomes unavailable. Emit one structured,
 * pageable error per family and reason per production instance, with fixed
 * fields only and never a value, length or partial secret. Plain
 * `hasUpstashRestEnv()` callers (per-app rate limiters) never alert.
 */
export function reportGuardFamilyProblem(
  family: string,
  reason: GuardStoreProblem
) {
  if (process.env.NODE_ENV !== 'production') return;
  const key = `${family}:${reason}`;
  if (reportedGuardProblems.has(key)) return;
  reportedGuardProblems.add(key);
  console.error(
    `[ALERT][abuse-guard] SR-951 ${JSON.stringify({
      alert: 'abuse-guard-store-missing',
      severity: 'critical',
      app: guardAlertServiceName(),
      family,
      reason,
    })}`
  );
}

/** Legacy-store miss; kept for the existing call sites. */
export function reportLegacyFamilyWithoutStore(family: string) {
  reportGuardFamilyProblem(family, 'legacy-without-pair');
}

/** The selector returned `off`: an explicit backend switch or a guard
 * configuration that is incomplete or too weak to use. */
export function reportGuardFamilyOff(family: string) {
  reportGuardFamilyProblem(
    family,
    process.env.ABUSE_GUARD_BACKEND?.trim().toLowerCase() === 'off'
      ? 'selector-off'
      : 'invalid-guard-config'
  );
}

/** Test-only reset of the once-per-family report. */
export function resetLegacyFamilyReportsForTests() {
  reportedGuardProblems.clear();
}

export function hasUpstashRestEnv(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return Boolean(url && token);
}

/**
 * Replay-fence cutover: until ABUSE_GUARD_REPLAY_LEGACY_UNTIL (an ISO date set
 * to cutover + the longest refresh-token TTL), fence keys consumed in the
 * legacy Upstash store still count as used, so tokens spent before the cutover
 * cannot be replayed against the new store. Legacy errors fail like store
 * errors (callers fail closed once `replay` is assigned).
 */
type ReplayLegacyState = 'disabled' | 'active' | 'invalid';

/**
 * `disabled` when no deadline is set or it has passed; `active` for a future
 * deadline with both legacy credentials; `invalid` for a malformed or blank
 * deadline, or an active deadline missing a credential. An invalid migration
 * must never silently skip the legacy check: callers treat it as unavailable.
 */
export function replayLegacyState(now = Date.now()): ReplayLegacyState {
  const raw =
    typeof process === 'undefined'
      ? undefined
      : process.env.ABUSE_GUARD_REPLAY_LEGACY_UNTIL;
  if (raw === undefined || raw === '') return 'disabled';
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/u.test(trimmed)) {
    return 'invalid';
  }
  const until = Date.parse(trimmed);
  if (!Number.isFinite(until)) return 'invalid';
  if (until <= now) return 'disabled';
  return hasUpstashRestEnv() ? 'active' : 'invalid';
}

type ReplayView = {
  get<T = unknown>(key: string): Promise<T | null>;
  set(
    key: string,
    value: unknown,
    options?: { ex?: number; px?: number; nx?: boolean; xx?: boolean }
  ): Promise<'OK' | null>;
};

export function withLegacyReplayReads<TView extends ReplayView>(
  view: TView,
  legacy: Pick<UpstashRestRedisClient, 'get'>
): TView {
  return {
    ...view,
    async get<T = unknown>(key: string) {
      const current = await view.get<T>(key);
      return current ?? ((await legacy.get<T>(key)) as T | null);
    },
    async set(
      key: string,
      value: unknown,
      options?: { ex?: number; px?: number; nx?: boolean; xx?: boolean }
    ) {
      if (options?.nx && (await legacy.get(key)) !== null) return null;
      return view.set(key, value, options);
    },
  };
}

/**
 * Returns the Redis-shaped client for abuse-protection state. A caller that
 * names its `family` is served by the Durable Object guard store once that
 * family is assigned to it, and gets null (store unavailable, so its own fail
 * policy applies) when the assignment is misconfigured or switched off.
 * Without a family, or for an unassigned one, this is the Upstash client.
 */
export async function getUpstashRestRedisClient(options?: {
  family?: AbuseGuardFamily;
  fairness?: GuardFairnessInput;
}): Promise<UpstashRestRedisClient | null> {
  if (options?.family) {
    const selection = selectAbuseGuard(options.family);
    if (selection.kind === 'off') {
      reportGuardFamilyOff(options.family);
      return null;
    }
    if (selection.kind === 'durable-object') {
      // Covers GET/MGET/SET/DEL/INCR/DECR/EXPIRE/TTL; SCAN throws.
      const view = createGuardRedisView(
        options.fairness
          ? selection.client.withFairness(options.fairness)
          : selection.client
      );
      if (options.family !== 'replay') {
        return view as unknown as UpstashRestRedisClient;
      }
      const migration = replayLegacyState();
      if (migration === 'disabled') {
        return view as unknown as UpstashRestRedisClient;
      }
      // An active cutover needs a usable legacy client; anything else is
      // unavailable, so the replay routes fail closed instead of skipping it.
      const legacy = migration === 'active' ? await legacyRestClient() : null;
      if (!legacy) {
        reportGuardFamilyProblem(
          options.family,
          migration === 'invalid' ? 'invalid-cutover' : 'legacy-without-pair'
        );
        return null;
      }
      return withLegacyReplayReads(
        view,
        legacy
      ) as unknown as UpstashRestRedisClient;
    }
  }
  const client = await legacyRestClient();
  if (!client && options?.family)
    reportLegacyFamilyWithoutStore(options.family);
  return client;
}

async function legacyRestClient(): Promise<UpstashRestRedisClient | null> {
  if (!hasUpstashRestEnv()) {
    return null;
  }

  const { Redis } = await import('@upstash/redis');
  const client = Redis.fromEnv();

  const restClient: UpstashRestRedisClient = {
    del: (...keys) => client.del(...keys),
    decr: (key) => client.decr(key),
    eval: (...args) => client.eval(...args),
    expire: (key, seconds) => client.expire(key, seconds),
    get: <T = unknown>(key: string) => client.get<T>(key),
    incr: (key) => client.incr(key),
    mget: (...args) => client.mget(...args),
    scan: client.scan.bind(client),
    set: (key, value, options) => client.set(key, value, options),
    ttl: (key) => client.ttl(key),
  };

  return restClient;
}

export async function getUpstashRatelimitRedisClient(): Promise<UpstashRatelimitRedisClient | null> {
  if (!hasUpstashRestEnv()) {
    return null;
  }

  const { Redis } = await import('@upstash/redis');
  const client = Redis.fromEnv();

  const ratelimitClient: UpstashRatelimitRedisClient = {
    eval: (...args) => client.eval(...args),
    evalsha: (...args) => client.evalsha(...args),
    get: <T = unknown>(key: string) => client.get<T>(key),
    set: (key, value, options) => client.set(key, value, options),
  };

  return ratelimitClient;
}
