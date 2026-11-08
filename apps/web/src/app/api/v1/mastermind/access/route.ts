import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { mastermindAccessPermission } from '@/lib/mastermind/access';

/** Live root-workspace admission for the mobile entry and native Worker. */
export const GET = withSessionAuth(
  async (_request, { user }) => {
    const rootPermissions = await getPermissions({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });

    return NextResponse.json(
      {
        enabled:
          rootPermissions?.containsPermission(mastermindAccessPermission()) ??
          false,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  },
  {
    allowAppSessionAuth: {
      targetApp: 'mastermind',
      requiredScope: 'internal-app:session',
    },
  }
);
