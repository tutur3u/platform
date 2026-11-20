import {
  hasEducationEnabled,
  resolveStudentForPlatformUser,
} from '@tuturuuu/education-core/tulearn/service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { resolveSessionAuthContext } from '@/lib/api-auth';
import { lmsFailure, lmsNotAvailable } from './lms-response';

type Authenticated = Extract<
  Awaited<ReturnType<typeof resolveSessionAuthContext>>,
  { ok: true }
>;

export type LmsStaffScope =
  | { kind: 'administrator' }
  | { kind: 'teacher'; contactId: string };

export async function resolveLmsStaffAccess(
  auth: Authenticated,
  routeWsId: string
) {
  const wsId = await normalizeWorkspaceId(routeWsId, auth.supabase);
  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId: auth.user.id,
    supabase: auth.supabase,
    requiredType: 'MEMBER',
  });
  if (membership.error === 'membership_lookup_failed') {
    return {
      error: lmsFailure(500, 'LMS_UNAVAILABLE', 'Failed to verify LMS access'),
    };
  }
  const denied = () =>
    lmsFailure(403, 'LMS_FORBIDDEN', 'LMS staff access is denied');
  if (!membership.ok) return { error: denied() };

  const permissions = await getPermissions({ user: auth.user, wsId });
  if (!permissions?.containsPermission('view_user_groups')) {
    return { error: denied() };
  }

  const db = await createAdminClient({ noCookie: true });
  if (!(await hasEducationEnabled(wsId, db))) {
    return { error: lmsNotAvailable() };
  }

  let scope: LmsStaffScope;
  if (permissions.containsPermission('update_user_groups')) {
    scope = { kind: 'administrator' };
  } else {
    const contact = await resolveStudentForPlatformUser({
      db,
      platformUserId: auth.user.id,
      wsId,
    });
    if (!contact) return { error: denied() };
    scope = { kind: 'teacher', contactId: contact.workspace_user_id };
  }

  return {
    db,
    wsId,
    scope,
    canViewContactNames:
      permissions.containsPermission('view_users_public_info') ||
      permissions.containsPermission('view_users_private_info'),
    canViewInvoices: permissions.containsPermission('view_invoices'),
  };
}
