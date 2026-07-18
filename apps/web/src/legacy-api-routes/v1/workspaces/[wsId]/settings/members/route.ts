import {
  getPermissions,
  verifyHasSecrets,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { CURRENT_USER_APP_SESSION_AUTH } from '../../../../users/me/session-auth';

export const GET = withSessionAuth<{ wsId: string }>(
  async (request, _context, { wsId }) => {
    try {
      const permissions = await getPermissions({ request, wsId });

      if (!permissions) {
        return NextResponse.json(
          { message: 'Workspace access denied' },
          { status: 403 }
        );
      }

      const canReadMemberSettings =
        permissions.containsPermission('manage_workspace_members') ||
        permissions.containsPermission('manage_workspace_roles');

      if (!canReadMemberSettings) {
        return NextResponse.json(
          { message: 'Workspace member settings access denied' },
          { status: 403 }
        );
      }

      const disableInvite = await verifyHasSecrets(wsId, ['DISABLE_INVITE']);

      return NextResponse.json({ disableInvite });
    } catch (error) {
      console.error('Error loading workspace member settings:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH,
    cache: { maxAge: 30, swr: 30 },
  }
);
