import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

// PATCH /api/v1/workspaces/[wsId]/time-tracking/break-types/[breakTypeId]
// Update a custom break type (workspace admins only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; breakTypeId: string }> }
) {
  try {
    const { wsId, breakTypeId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify break type exists and belongs to workspace
    const { data: existingBreakType } = await supabase
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

    const sbAdmin = await createAdminClient();

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
    const { data: breakType, error } = await sbAdmin
      .from('workspace_break_types')
      .update(updateData)
      .eq('id', breakTypeId)
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
  _: NextRequest,
  { params }: { params: Promise<{ wsId: string; breakTypeId: string }> }
) {
  try {
    const { wsId, breakTypeId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify break type exists and belongs to workspace
    const { data: breakType } = await supabase
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

    const sbAdmin = await createAdminClient();

    // Delete the break type
    // Note: Associated break records will have their break_type_id set to NULL (on delete set null)
    // but will retain break_type_name for historical reference
    const { error } = await sbAdmin
      .from('workspace_break_types')
      .delete()
      .eq('id', breakTypeId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting break type:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
