import type { AbuseGuardBinding } from '@tuturuuu/utils/abuse-guard/client';
import { configureAbuseGuardRuntime } from '@tuturuuu/utils/abuse-guard/select';

/**
 * Optional abuse-guard bindings. They are added to the Worker configuration
 * only after `tuturuuu-abuse-guard` is published; until then Meet keeps its
 * legacy password-attempt store path.
 */
type MeetAbuseGuardEnv = {
  ABUSE_GUARD?: AbuseGuardBinding;
  ABUSE_GUARD_KEY_PEPPER?: string;
  ABUSE_GUARD_FAMILIES?: string;
  ABUSE_GUARD_TIMEOUT_MS?: string;
};

/** Injects the service binding for shared guards; unchanged input is a no-op. */
export function configureMeetAbuseGuard(env: object) {
  const guard = env as MeetAbuseGuardEnv;
  configureAbuseGuardRuntime(
    guard.ABUSE_GUARD
      ? {
          binding: guard.ABUSE_GUARD,
          pepper: guard.ABUSE_GUARD_KEY_PEPPER,
          families: guard.ABUSE_GUARD_FAMILIES,
          timeoutMs: guard.ABUSE_GUARD_TIMEOUT_MS,
        }
      : null
  );
}
