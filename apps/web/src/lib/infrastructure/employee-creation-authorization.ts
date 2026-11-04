import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import { resolveSupabaseSessionRequest } from '@tuturuuu/auth/supabase-session-user';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';
import type { EmployeeCreationAuthorization } from './employee-creation-boundary';

export async function authorizeEmployeeCreation(
  request: Request
): Promise<EmployeeCreationAuthorization> {
  try {
    const credential = request.headers.get('authorization');
    const bearer = credential?.match(/^Bearer (\S+)$/i)?.[1];
    const user =
      credential !== null
        ? bearer
          ? bearer.startsWith('ttr_app_')
            ? getAppSessionUserFromRequest(
                { headers: new Headers({ authorization: credential }) },
                { targetApp: 'infra' }
              )
            : (await resolveSupabaseSessionRequest(request)).user
          : null
        : await getSatelliteAppSessionUser('infra');
    if (!user) return { authorized: false, status: 401 };
    return await authorizeCurrentEmployeeActor(request, user);
  } catch {
    return { authorized: false, status: 503 };
  }
}

export async function authorizeCurrentEmployeeActor(
  request: Request,
  user: { id: string; email?: string | null },
  options: { requireMatchingEmail?: boolean } = {}
): Promise<EmployeeCreationAuthorization> {
  try {
    const signedEmail = options.requireMatchingEmail
      ? z.email().safeParse(user.email?.trim().toLowerCase())
      : null;
    if (
      !isExactTuturuuuDotComEmail(user.email) ||
      (signedEmail && !signedEmail.success)
    )
      return { authorized: false, status: 403 };
    const permissions = await getPermissions({
      request,
      user,
      wsId: ROOT_WORKSPACE_ID,
    });
    if (
      permissions?.membershipType !== 'MEMBER' ||
      !permissions.containsPermission('manage_internal_accounts')
    )
      return { authorized: false, status: 403 };
    const admin = await createAdminClient({ noCookie: true });
    const membership = await admin
      .from('workspace_members')
      .select('type')
      .eq('ws_id', ROOT_WORKSPACE_ID)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membership.error) return { authorized: false, status: 503 };
    if (membership.data?.type !== 'MEMBER')
      return { authorized: false, status: 403 };
    const { data, error } = await admin.auth.admin.getUserById(user.id);
    if (error) return { authorized: false, status: 503 };
    const current = data.user;
    if (
      !current ||
      current.id !== user.id ||
      !isVerifiedTuturuuuStaffSession(current) ||
      (signedEmail?.success &&
        current.email?.trim().toLowerCase() !== signedEmail.data) ||
      !current.email_confirmed_at ||
      (current.banned_until &&
        (!Number.isFinite(Date.parse(current.banned_until)) ||
          Date.parse(current.banned_until) > Date.now()))
    )
      return { authorized: false, status: 403 };
    return { authorized: true, actorUserId: current.id };
  } catch {
    return { authorized: false, status: 503 };
  }
}
