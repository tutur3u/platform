import { ABUSE_GUARD_FAMILIES, type AbuseGuardFamily } from './protocol';
import { type AbuseGuardEnv, selectAbuseGuard } from './select';

export type AbuseStoreCoverageEnv = AbuseGuardEnv &
  Partial<
    Record<
      | 'UPSTASH_REDIS_REST_URL'
      | 'UPSTASH_REDIS_REST_TOKEN'
      | 'ABUSE_GUARD_REPLAY_LEGACY_UNTIL',
      string
    >
  >;

export type AbuseStoreFamilyCoverage = {
  family: AbuseGuardFamily;
  store: 'durable-object' | 'upstash' | 'none';
  /** Fixed, value-free explanation when `store` is `none`. */
  reason?: string;
};

const LEGACY_UNTIL = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/u;

function hasUpstashPair(env: AbuseStoreCoverageEnv) {
  return Boolean(
    env.UPSTASH_REDIS_REST_URL?.trim() && env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

/**
 * SR-951: which store each abuse-guard family would use under `env`, using
 * the same selector as runtime. A family is covered by a usable Durable Object
 * guard or by the legacy Upstash pair; `off`, an incomplete guard config, or
 * a legacy family without the Upstash pair is not covered. A `replay` family
 * on the guard store also needs the Upstash pair while a legacy-read cutover
 * (ABUSE_GUARD_REPLAY_LEGACY_UNTIL) is active, and a malformed cutover date is
 * never covered (runtime treats it as unavailable).
 */
export function abuseStoreCoverage(
  env: AbuseStoreCoverageEnv,
  now = Date.now()
): AbuseStoreFamilyCoverage[] {
  const upstash = hasUpstashPair(env);
  return ABUSE_GUARD_FAMILIES.map((family) => {
    const selection = selectAbuseGuard(family, env);
    if (selection.kind === 'legacy') {
      return upstash
        ? { family, store: 'upstash' as const }
        : {
            family,
            store: 'none' as const,
            reason: 'uses Upstash but UPSTASH_REDIS_REST_URL/TOKEN are not set',
          };
    }
    if (selection.kind === 'off') {
      return {
        family,
        store: 'none' as const,
        reason:
          'assigned to the guard store, which is off or incompletely configured',
      };
    }
    if (family === 'replay') {
      const raw = env.ABUSE_GUARD_REPLAY_LEGACY_UNTIL;
      if (raw !== undefined && raw !== '') {
        const trimmed = raw.trim();
        const until = LEGACY_UNTIL.test(trimmed) ? Date.parse(trimmed) : NaN;
        if (!Number.isFinite(until))
          return {
            family,
            store: 'none' as const,
            reason: 'ABUSE_GUARD_REPLAY_LEGACY_UNTIL is malformed',
          };
        if (until > now && !upstash)
          return {
            family,
            store: 'none' as const,
            reason:
              'an active replay cutover needs UPSTASH_REDIS_REST_URL/TOKEN',
          };
      }
    }
    return { family, store: 'durable-object' as const };
  });
}
