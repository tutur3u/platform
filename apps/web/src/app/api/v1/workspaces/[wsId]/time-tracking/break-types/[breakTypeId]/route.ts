import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

// PATCH /api/v1/workspaces/[wsId]/time-tracking/break-types/[breakTypeId]
// Update a custom break type (workspace admins only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; breakTypeId: string }> }
) {
  try {
    const { wsId, breakTypeId } = await params;
    const supabase = await createClient(request);
    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const permissions = await getPermissions({
      wsId: normalizedWsId,
      request,
    });

    if (!permissions) {
      return NextResponse.json(
        { error: 'Failed to resolve permissions' },
        { status: 500 }
      );
    }

    if (
      permissions.withoutPermission('manage_workspace_settings') ||
      permissions.withoutPermission('manage_time_tracking_requests')
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions to modify break types' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Verify break type exists and belongs to workspace
    const { data: existingBreakType, error: existingBreakTypeError } =
      await sbAdmin
        .from('workspace_break_types')
        .select('*')
        .eq('id', breakTypeId)
        .eq('ws_id', normalizedWsId)
        .maybeSingle();

    if (existingBreakTypeError) {
      throw existingBreakTypeError;
    }

    if (!existingBreakType) {
      return NextResponse.json(
        { error: 'Break type not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, description, color, icon, isDefault } = body;

    // Validate name if provided
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return NextResponse.json(
          { error: 'Break type name cannot be empty' },
          { status: 400 }
        );
      }

      if (name.length > 50) {
        return NextResponse.json(
          { error: 'Break type name must be 50 characters or less' },
          { status: 400 }
        );
      }
    }

    // Build update object
    const updateData: {
      name?: string;
      description?: string | null;
      color?: string;
      icon?: string | null;
      is_default?: boolean;
    } = {};

    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined)
      updateData.description = description?.trim() || null;
    if (color !== undefined) updateData.color = color;
    if (icon !== undefined) updateData.icon = icon || null;
    if (isDefault !== undefined && isDefault !== true) {
      updateData.is_default = isDefault;
    }

    let breakType = existingBreakType;
    if (Object.keys(updateData).length > 0) {
      const { data, error } = await sbAdmin
        .from('workspace_break_types')
        .update(updateData)
        .eq('id', breakTypeId)
        .eq('ws_id', normalizedWsId)
        .select()
        .maybeSingle();

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { error: 'A break type with this name already exists' },
            { status: 409 }
          );
        }
        throw error;
      }

      if (!data) {
        return NextResponse.json(
          { error: 'Break type not found' },
          { status: 404 }
        );
      }

      breakType = data;
    }

    if (isDefault === true) {
      const { data: defaultRows, error: setDefaultError } = await sbAdmin.rpc(
        'set_default_break_type',
        {
          p_ws_id: normalizedWsId,
          p_target_id: breakTypeId,
        }
      );

      if (setDefaultError) {
        throw setDefaultError;
      }

      if (!defaultRows || defaultRows.length === 0) {
        return NextResponse.json(
          { error: 'Break type not found' },
          { status: 404 }
        );
      }

      const { data: refreshedBreakType, error: refreshedBreakTypeError } =
        await sbAdmin
          .from('workspace_break_types')
          .select('*')
          .eq('id', breakTypeId)
          .eq('ws_id', normalizedWsId)
          .maybeSingle();

      if (refreshedBreakTypeError) {
        throw refreshedBreakTypeError;
      }

      if (!refreshedBreakType) {
        return NextResponse.json(
          { error: 'Break type not found' },
          { status: 404 }
        );
      }

      breakType = refreshedBreakType;
    }

    if (!breakType) {
      return NextResponse.json(
        { error: 'Break type not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ breakType });
  } catch (error) {
    console.error('Error updating break type:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/workspaces/[wsId]/time-tracking/break-types/[breakTypeId]
// Delete a custom break type (workspace admins only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; breakTypeId: string }> }
) {
  try {
    const { wsId, breakTypeId } = await params;
    const supabase = await createClient(request);
    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const permissions = await getPermissions({
      wsId: normalizedWsId,
      request,
    });

    if (!permissions) {
      return NextResponse.json(
        { error: 'Failed to resolve permissions' },
        { status: 500 }
      );
    }

    if (
      permissions.withoutPermission('manage_workspace_settings') ||
      permissions.withoutPermission('manage_time_tracking_requests')
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions to delete break types' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Verify break type exists and belongs to workspace
    const { data: breakType, error: breakTypeError } = await sbAdmin
      .from('workspace_break_types')
      .select('id')
      .eq('id', breakTypeId)
      .eq('ws_id', normalizedWsId)
      .maybeSingle();

    if (breakTypeError) {
      throw breakTypeError;
    }

    if (!breakType) {
      return NextResponse.json(
        { error: 'Break type not found' },
        { status: 404 }
      );
    }

    // Delete the break type
    // Note: Associated break records will have their break_type_id set to NULL (on delete set null)
    // but will retain break_type_name for historical reference
    const { data: deletedBreakType, error } = await sbAdmin
      .from('workspace_break_types')
      .delete()
      .eq('id', breakTypeId)
      .eq('ws_id', normalizedWsId)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message || error },
        { status: 500 }
      );
    }

    if (!deletedBreakType) {
      return NextResponse.json(
        { error: 'Break type not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting break type:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
