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
  const user = await getSatelliteAppSessionUser('infra');

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

  return {
    ok: true as const,
    sbAdmin: await createAdminClient({ noCookie: true }),
    user,
  };
}
