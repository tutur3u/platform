import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { WORKSPACE_MEMBERSHIP_LOOKUP_FAILED_MESSAGE } from '../../../../../lib/workspace-membership-http';

export type ChangelogPermissionDenial =
  | 'unauthenticated'
  | 'membership_lookup_failed'
  | 'forbidden';

export type CheckChangelogPermissionResult =
  | { authorized: true; user: SupabaseUser }
  | {
      authorized: false;
      user: SupabaseUser | null;
      denial: ChangelogPermissionDenial;
    };

/**
 * Check if the current user has the manage_changelog permission.
 *
 * Uses `verifyWorkspaceMembershipType` to distinguish DB lookup errors from
 * real authorization denials, then `getPermissions` for the permission union.
 */
export async function checkChangelogPermission(
  supabase: TypedSupabaseClient
): Promise<CheckChangelogPermissionResult> {
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return { authorized: false, user: null, denial: 'unauthenticated' };
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: ROOT_WORKSPACE_ID,
    userId: user.id,
    supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return { authorized: false, user, denial: 'membership_lookup_failed' };
  }

  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });

  if (!permissions?.containsPermission('manage_changelog')) {
    return { authorized: false, user, denial: 'forbidden' };
  }

  return { authorized: true, user };
}

/**
 * When authorization failed, maps `denial` to the correct HTTP status (including
 * 500 for membership DB lookup failures).
 */
/** Call only after `changelogPermissionDeniedResponse` returned null. */
export function authorizedChangelogUser(
  result: CheckChangelogPermissionResult
): SupabaseUser {
  if (!result.authorized) {
    throw new Error('authorizedChangelogUser: permission was not granted');
  }
  return result.user;
}

export function changelogPermissionDeniedResponse(
  result: CheckChangelogPermissionResult
): NextResponse | null {
  if (result.authorized) return null;

  if (result.denial === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: WORKSPACE_MEMBERSHIP_LOOKUP_FAILED_MESSAGE },
      { status: 500 }
    );
  }

  const hasUser = result.user !== null;
  return NextResponse.json(
    { message: hasUser ? 'Forbidden' : 'Unauthorized' },
    { status: hasUser ? 403 : 401 }
  );
}
