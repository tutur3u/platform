/**
 * Mail deployment profile, fixed per artifact at build time.
 *
 * `vite.config.ts` replaces `process.env.MAIL_DEPLOYMENT_PROFILE` with a
 * literal after validating it, so each comparison below folds and the other
 * environment's hosts never reach the bundle. There is no default anywhere:
 * a missing or unknown value fails the build, local dev and tests.
 * `development` is accepted only by the dev server, never by a build.
 */
export type MailDeploymentProfile = 'production' | 'staging' | 'development';

/** The staging issuer origin. Service tokens attach to this origin only. */
export const MAIL_STAGING_ISSUER_ORIGIN = 'https://web.tutur3u.com';

export function resolveMailDeploymentProfile(
  value: string | undefined,
  command: 'build' | 'serve' = 'build'
): MailDeploymentProfile {
  if (value === 'production' || value === 'staging') return value;
  if (value === 'development' && command === 'serve') return value;
  throw new Error(
    command === 'serve'
      ? 'MAIL_DEPLOYMENT_PROFILE must be "production", "staging" or "development"'
      : 'MAIL_DEPLOYMENT_PROFILE must be exactly "production" or "staging" for a build'
  );
}

/** Fails an unfolded build-time profile branch. Never returns. */
export function invalidMailDeploymentProfile(): never {
  resolveMailDeploymentProfile(process.env.MAIL_DEPLOYMENT_PROFILE, 'serve');
  throw new Error('Unreachable Mail deployment profile');
}

/** True only in the staging artifact; folds to `false` in production. */
export function isMailStagingArtifact() {
  if (process.env.MAIL_DEPLOYMENT_PROFILE === 'staging') return true;
  if (
    process.env.MAIL_DEPLOYMENT_PROFILE === 'production' ||
    process.env.MAIL_DEPLOYMENT_PROFILE === 'development'
  )
    return false;
  return invalidMailDeploymentProfile();
}
