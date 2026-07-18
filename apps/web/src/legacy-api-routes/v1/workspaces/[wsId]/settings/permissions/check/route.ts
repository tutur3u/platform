import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { CURRENT_USER_APP_SESSION_AUTH } from '../../../../../users/me/session-auth';

export const GET = withSessionAuth<{ wsId: string }>(
  async (request, _context, { wsId }) => {
    const url = new URL(request.url);
    const permission = url.searchParams.get('permission');

    if (!permission) {
      return NextResponse.json(
        { message: 'Missing permission' },
        { status: 400 }
      );
    }

    try {
      const permissions = await getPermissions({ wsId, request });

      if (!permissions) {
        return NextResponse.json(
          { message: 'Workspace access denied' },
          { status: 403 }
        );
      }

      return NextResponse.json({
        hasPermission: permissions.containsPermission(permission as never),
      });
    } catch (error) {
      console.error('Error checking workspace permission:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH }
);
