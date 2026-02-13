import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await context.params;
    const {
      enabled,
      allow_challenge_management,
      allow_manage_all_challenges,
      allow_role_management,
      allow_workspace_creation,
    } = await req.json();

    // Check permissions - only root workspace members with manage_workspace_roles can update platform roles
    const permissions = await getPermissions({
      wsId: ROOT_WORKSPACE_ID,
    });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { withoutPermission } = permissions;

    if (withoutPermission('manage_workspace_roles')) {
      return NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Get current user to ensure they're authorized
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const sbAdmin = await createAdminClient();
    if (!sbAdmin) {
      return NextResponse.json(
        { message: 'Failed to connect to database' },
        { status: 500 }
      );
    }

    // Update the platform user roles
    const { data, error } = await sbAdmin
      .from('platform_user_roles')
      .update({
        enabled,
        allow_challenge_management,
        allow_manage_all_challenges,
        allow_role_management,
        allow_workspace_creation,
      })
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error('Error updating platform user role:', error);
      return NextResponse.json(
        { message: 'Failed to update user role' },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'User role updated successfully',
      data: data[0],
    });
  } catch (error) {
    console.error('Error in PUT /api/v1/platform/users/[userId]/roles:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
