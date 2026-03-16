import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: memberCheck, error: memberError } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck) {
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
    const { data: existingBreakType } = await sbAdmin
      .from('workspace_break_types')
      .select('id')
      .eq('id', breakTypeId)
      .eq('ws_id', normalizedWsId)
      .single();

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
    if (isDefault !== undefined) updateData.is_default = isDefault;

    // Update the break type
    if (isDefault === true) {
      const { error: clearDefaultError } = await sbAdmin
        .from('workspace_break_types')
        .update({ is_default: false })
        .eq('ws_id', normalizedWsId)
        .eq('is_default', true)
        .neq('id', breakTypeId);

      if (clearDefaultError) {
        throw clearDefaultError;
      }
    }

    const { data: breakType, error } = await sbAdmin
      .from('workspace_break_types')
      .update(updateData)
      .eq('id', breakTypeId)
      .eq('ws_id', normalizedWsId)
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A break type with this name already exists' },
          { status: 409 }
        );
      }
      throw error;
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: memberCheck, error: memberError } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck) {
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
    const { data: breakType } = await sbAdmin
      .from('workspace_break_types')
      .select('id')
      .eq('id', breakTypeId)
      .eq('ws_id', normalizedWsId)
      .single();

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
      .single();

    if (error || !deletedBreakType) {
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
