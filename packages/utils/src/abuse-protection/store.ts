/**
 * Store for OTP/IP abuse counters, IP blocks and the suspension cache.
 *
 * With the `ratelimit` abuse-guard family assigned, this is the Durable
 * Object guard store, resolved through the selector on every call so a
 * runtime binding reconfiguration takes effect (the selector owns client
 * caching, so resolving is cheap). This matches the edge proxy store.
 *
 * Without the assignment, the legacy Upstash client is cached per isolate.
 * Every caller fails open when no store is usable, and that condition raises
 * the SR-951 alert instead of passing silently.
 */
import { isAbuseGuardFamilyAssigned } from '../abuse-guard/select';
import { sanitizeLogError } from '../log-sanitizer';
import {
  getUpstashRestRedisClient,
  hasUpstashRestEnv,
  reportLegacyFamilyWithoutStore,
} from '../upstash-rest';
import type { RedisClient } from './types';

export const ABUSE_PROTECTION_GUARD_FAMILY = 'ratelimit' as const;

let legacyClient: RedisClient | null = null;
let legacyInitialized = false;

export async function getAbuseProtectionStore(): Promise<RedisClient | null> {
  if (isAbuseGuardFamilyAssigned(ABUSE_PROTECTION_GUARD_FAMILY)) {
    try {
      // Reports SR-951 itself when the assignment is unusable.
      return await getUpstashRestRedisClient({
        family: ABUSE_PROTECTION_GUARD_FAMILY,
      });
    } catch (error) {
      console.error(
        '[Abuse Protection] guard store unavailable - failing open',
        sanitizeLogError(error)
      );
      return null;
    }
  }

  if (legacyInitialized) return legacyClient;
  legacyInitialized = true;

  if (!hasUpstashRestEnv()) {
    reportLegacyFamilyWithoutStore(ABUSE_PROTECTION_GUARD_FAMILY);
    legacyClient = null;
    return null;
  }

  try {
    legacyClient = await getUpstashRestRedisClient();
  } catch (error) {
    console.warn(
      '[Abuse Protection] Redis unavailable - failing open',
      sanitizeLogError(error)
    );
    legacyClient = null;
  }
  return legacyClient;
}

/** After a failed command, reconnect the legacy client on the next call. */
export function invalidateAbuseProtectionStore(): void {
  legacyClient = null;
  legacyInitialized = false;
}
