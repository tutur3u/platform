/**
 * Calendar deployment profile, fixed per artifact at build time.
 *
 * `vite.config.mts` replaces `process.env.CALENDAR_DEPLOYMENT_PROFILE` with a
 * literal after validating it, so each comparison below folds and the other
 * environment's hosts never reach the bundle. There is no default anywhere:
 * a missing or unknown value fails the build, local dev and tests.
 * `development` is accepted only by the dev server, never by a build.
 */
export type CalendarDeploymentProfile =
  | 'production'
  | 'staging'
  | 'development';

/** The staging issuer origin. Service tokens attach to this origin only. */
export const CALENDAR_STAGING_ISSUER_ORIGIN = 'https://web.staging.tutur3u.com';

export function resolveCalendarDeploymentProfile(
  value: string | undefined,
  command: 'build' | 'serve' = 'build'
): CalendarDeploymentProfile {
  if (value === 'production' || value === 'staging') return value;
  if (value === 'development' && command === 'serve') return value;
  throw new Error(
    command === 'serve'
      ? 'CALENDAR_DEPLOYMENT_PROFILE must be "production", "staging" or "development"'
      : 'CALENDAR_DEPLOYMENT_PROFILE must be exactly "production" or "staging" for a build'
  );
}

/** Fails an unfolded build-time profile branch. Never returns. */
export function invalidCalendarDeploymentProfile(): never {
  resolveCalendarDeploymentProfile(
    process.env.CALENDAR_DEPLOYMENT_PROFILE,
    'serve'
  );
  throw new Error('Unreachable Calendar deployment profile');
}

/** True only in the staging artifact; folds to `false` in production. */
export function isCalendarStagingArtifact() {
  if (process.env.CALENDAR_DEPLOYMENT_PROFILE === 'staging') return true;
  if (
    process.env.CALENDAR_DEPLOYMENT_PROFILE === 'production' ||
    process.env.CALENDAR_DEPLOYMENT_PROFILE === 'development'
  )
    return false;
  return invalidCalendarDeploymentProfile();
}
