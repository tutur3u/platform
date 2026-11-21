import type { AbuseGuardBinding } from '@tuturuuu/utils/abuse-guard/client';
import { configureAbuseGuardRuntime } from '@tuturuuu/utils/abuse-guard/select';

type FinanceAbuseGuardEnv = {
  ABUSE_GUARD?: AbuseGuardBinding;
  ABUSE_GUARD_KEY_PEPPER?: string;
  ABUSE_GUARD_FAMILIES?: string;
  ABUSE_GUARD_TIMEOUT_MS?: string;
};

export function configureFinanceAbuseGuard(env: object) {
  const guard = env as FinanceAbuseGuardEnv;
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
