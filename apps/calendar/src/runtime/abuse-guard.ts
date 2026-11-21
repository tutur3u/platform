import type { AbuseGuardBinding } from '@tuturuuu/utils/abuse-guard/client';
import { configureAbuseGuardRuntime } from '@tuturuuu/utils/abuse-guard/select';

/** Worker environment entries that configure the abuse-guard service binding. */
type CalendarAbuseGuardEnv = {
  ABUSE_GUARD?: AbuseGuardBinding;
  ABUSE_GUARD_KEY_PEPPER?: string;
  ABUSE_GUARD_FAMILIES?: string;
  ABUSE_GUARD_TIMEOUT_MS?: string;
};

/** Routes assigned guard families through `ABUSE_GUARD` when it is bound; without it they keep their default selection. */
export function configureCalendarAbuseGuard(env: object) {
  const guard = env as CalendarAbuseGuardEnv;
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
