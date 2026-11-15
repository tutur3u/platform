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
  /**
   * True when the decision rests on Sensitive (redacted) values whose
   * presence is known but whose strength or shape could not be checked.
   */
  presenceOnly?: boolean;
};

/**
 * Stand-ins for Sensitive values that `vercel pull` redacts. Presence is
 * known from the placeholder; the stand-ins satisfy only the selector's shape
 * and strength checks, which cannot be run on a redacted value.
 */
const REDACTED_STAND_INS: Record<string, string> = {
  ABUSE_GUARD_KEY_PEPPER: 'redacted-sensitive-value-present-'.padEnd(32, 'x'),
  ABUSE_GUARD_SECRET: 'redacted-sensitive-value-present-'.padEnd(32, 'x'),
  ABUSE_GUARD_URL: 'https://redacted-sensitive-value.invalid',
  UPSTASH_REDIS_REST_TOKEN: 'redacted-sensitive-value-present',
  UPSTASH_REDIS_REST_URL: 'https://redacted-sensitive-value.invalid',
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
  input: AbuseStoreCoverageEnv,
  now = Date.now(),
  redactedKeys: ReadonlySet<string> = new Set()
): AbuseStoreFamilyCoverage[] {
  const env: AbuseStoreCoverageEnv = { ...input };
  for (const key of redactedKeys) {
    const standIn = REDACTED_STAND_INS[key];
    if (standIn) (env as Record<string, string>)[key] = standIn;
  }
  const upstash = hasUpstashPair(env);
  const redactedGuard = [
    'ABUSE_GUARD_URL',
    'ABUSE_GUARD_SECRET',
    'ABUSE_GUARD_KEY_PEPPER',
  ].some((key) => redactedKeys.has(key));
  const redactedUpstash = [
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
  ].some((key) => redactedKeys.has(key));
  return ABUSE_GUARD_FAMILIES.map((family) => coverFamily(family));

  function coverFamily(family: AbuseGuardFamily): AbuseStoreFamilyCoverage {
    const selection = selectAbuseGuard(family, env);
    if (selection.kind === 'legacy') {
      return upstash
        ? {
            family,
            store: 'upstash' as const,
            ...(redactedUpstash ? { presenceOnly: true } : {}),
          }
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
    return {
      family,
      store: 'durable-object' as const,
      ...(redactedGuard ? { presenceOnly: true } : {}),
    };
  }
}
