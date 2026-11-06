import 'server-only';

import type { PermissionId } from '@tuturuuu/types';

/**
 * Rollout switch for the explicit `manage_mastermind` grant. Production applies
 * migrations after the deployment marker, so this stays off until the grant is
 * read back with exactly one holder; off keeps the earlier rule everywhere. See
 * apps/docs/platform/features/mobile-mastermind.mdx#rollout.
 */
export function mastermindRequiresExplicitGrant(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.MASTERMIND_REQUIRE_EXPLICIT_GRANT === 'true';
}

/** The root workspace permission that admits a user to Mastermind. */
export function mastermindAccessPermission(
  env?: Record<string, string | undefined>
): PermissionId {
  return mastermindRequiresExplicitGrant(env)
    ? 'manage_mastermind'
    : 'view_infrastructure';
}
