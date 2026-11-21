import type { AbuseGuardBinding } from '@tuturuuu/utils/abuse-guard/client';
import { configureAbuseGuardRuntime } from '@tuturuuu/utils/abuse-guard/select';

type LearnAbuseGuardEnv = {
  ABUSE_GUARD?: AbuseGuardBinding;
  ABUSE_GUARD_KEY_PEPPER?: string;
  ABUSE_GUARD_FAMILIES?: string;
  ABUSE_GUARD_TIMEOUT_MS?: string;
};

/** Routes the proxy family through `ABUSE_GUARD` when bound; without it the default selection stays. */
export function configureLearnAbuseGuard(env: object) {
  const guard = env as LearnAbuseGuardEnv;
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
