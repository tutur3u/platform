import {
  hasEducationEnabled,
  resolveStudentForPlatformUser,
} from '@tuturuuu/education-core/tulearn/service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';

export type LmsStaffScope =
  | { kind: 'administrator' }
  | { kind: 'teacher'; contactId: string };

export type LmsStaffAccess =
  | {
      ok: true;
      canViewContactNames: boolean;
      canViewInvoices: boolean;
      db: TypedSupabaseClient;
      scope: LmsStaffScope;
      wsId: string;
    }
  | {
      ok: false;
      reason: 'denied' | 'education_disabled' | 'lookup_failed';
    };

/**
 * Teach-area admission used by the LMS shells and the web staff routes.
 * Membership, `view_user_groups`, the education flag, and either
 * `update_user_groups` or a linked contact are required.
 */
export async function checkLmsStaffAccess({
  supabase,
  user,
  wsId: routeWsId,
}: {
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
  wsId: string;
}): Promise<LmsStaffAccess> {
  const wsId = await normalizeWorkspaceId(routeWsId, supabase);
  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase,
    userId: user.id,
    wsId,
  });
  if (membership.error === 'membership_lookup_failed') {
    return { ok: false, reason: 'lookup_failed' };
  }
  if (!membership.ok) return { ok: false, reason: 'denied' };

  const permissions = await getPermissions({ user, wsId });
  if (!permissions?.containsPermission('view_user_groups')) {
    return { ok: false, reason: 'denied' };
  }

  const db = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  if (!(await hasEducationEnabled(wsId, db))) {
    return { ok: false, reason: 'education_disabled' };
  }

  let scope: LmsStaffScope;
  if (permissions.containsPermission('update_user_groups')) {
    scope = { kind: 'administrator' };
  } else {
    const teacher = await teacherScope(db, user.id, wsId);
    if (!teacher) return { ok: false, reason: 'denied' };
    scope = teacher;
  }

  return {
    ok: true,
    canViewContactNames:
      permissions.containsPermission('view_users_public_info') ||
      permissions.containsPermission('view_users_private_info'),
    canViewInvoices: permissions.containsPermission('view_invoices'),
    db,
    scope,
    wsId,
  };
}

async function teacherScope(
  db: TypedSupabaseClient,
  platformUserId: string,
  wsId: string
): Promise<LmsStaffScope | null> {
  const contact = await resolveStudentForPlatformUser({
    db,
    platformUserId,
    wsId,
  });
  if (!contact) return null;
  return { kind: 'teacher', contactId: contact.workspace_user_id };
}

/** Area-switch view of staff access. Any failed check hides the switch. */
export async function hasLmsStaffAreaAccess(input: {
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
  wsId: string;
}): Promise<boolean> {
  const access = await checkLmsStaffAccess(input);
  return access.ok;
}
