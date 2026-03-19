import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

export const GET = withSessionAuth<{ wsId: string }>(
  async (request, _context, { wsId }) => {
    try {
      const permissions = await getPermissions({ wsId, request });

      if (!permissions) {
        return NextResponse.json(
          { message: 'Workspace access denied' },
          { status: 403 }
        );
      }

      return NextResponse.json({
        manage_subscription: permissions.containsPermission(
          'manage_subscription'
        ),
        manage_workspace_settings: permissions.containsPermission(
          'manage_workspace_settings'
        ),
      });
    } catch (error) {
      console.error('Error loading workspace permissions:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { cache: { maxAge: 30, swr: 30 } }
);
