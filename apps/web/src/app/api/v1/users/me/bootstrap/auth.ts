import type { AppSessionTargetApp } from '@tuturuuu/auth/app-session';
import { ALL_SATELLITE_APP_SESSION_TARGETS } from '@/lib/api-auth-audiences';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';

const SATELLITE_TARGETS: readonly string[] = ALL_SATELLITE_APP_SESSION_TARGETS;

/**
 * App-session audience of the bootstrap: the targets that every covered
 * individual route accepts, never a union. `parley`, `cli` and `git` are left
 * out, and so is any scope-only grant. Passing this constant explicitly keeps
 * the shared audience rules untouched.
 */
export const BOOTSTRAP_APP_SESSION_AUTH = {
  targetApp: CURRENT_USER_APP_SESSION_AUTH.targetApp.filter((target) =>
    SATELLITE_TARGETS.includes(target)
  ) as readonly AppSessionTargetApp[],
} as const;
