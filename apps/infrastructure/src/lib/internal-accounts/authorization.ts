import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import { resolveSupabaseSessionRequest } from '@tuturuuu/auth/supabase-session-user';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { PermissionId } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

const MANAGE_INTERNAL_ACCOUNTS_PERMISSION =
  'manage_internal_accounts' as PermissionId;

export async function authorizeInternalAccountRequest(request: Request) {
  const credential = request.headers.get('authorization');
  const bearer = credential?.match(/^Bearer (\S+)$/i)?.[1];
  // An explicit native credential must succeed on its own; never fall back to
  // browser cookies belonging to a different account.
  const user = credential
    ? bearer
      ? bearer.startsWith('ttr_app_')
        ? getAppSessionUserFromRequest(
            { headers: new Headers({ authorization: credential }) },
            { targetApp: 'infra' }
          )
        : (await resolveSupabaseSessionRequest(request)).user
      : null
    : await getSatelliteAppSessionUser('infra');

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const permissions = await getPermissions({
    request,
    user,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (
    !isExactTuturuuuDotComEmail(user.email) ||
    !permissions?.containsPermission(MANAGE_INTERNAL_ACCOUNTS_PERMISSION)
  ) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin.auth.admin
    .getUserById(user.id)
    .catch(() => ({
      data: { user: null },
      error: new Error('Identity verification unavailable'),
    }));
  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Unable to verify administrator access' },
        { status: 503 }
      ),
    };
  }
  const currentUser = data.user;
  if (
    !currentUser ||
    currentUser.id !== user.id ||
    !currentUser.email_confirmed_at ||
    !isExactTuturuuuDotComEmail(currentUser.email) ||
    (currentUser.banned_until &&
      Date.parse(currentUser.banned_until) > Date.now())
  ) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return { ok: true as const, sbAdmin, user: currentUser };
}
