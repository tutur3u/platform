import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { mastermindAccessPermission } from '@/lib/mastermind/access';

/**
 * Whether the signed-in user may see Mastermind. The mobile entry follows this
 * answer so a store build never picks the access rule itself. Cosmetic: the
 * hub Worker and push-events keep their own server-side checks.
 */
export const GET = withSessionAuth(async (_request, { user }) => {
  const rootPermissions = await getPermissions({
    user,
    wsId: ROOT_WORKSPACE_ID,
  });

  return NextResponse.json({
    enabled:
      rootPermissions?.containsPermission(mastermindAccessPermission()) ??
      false,
  });
});
