import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{
    wsId: string;
    labelId: string;
  }>;
}

// PATCH - Update a label
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId, labelId } = await params;
    const body = await request.json();
    const { name, color } = body;

    if (!name || !color) {
      return NextResponse.json(
        { error: 'Name and color are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has access to the workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify the label exists and belongs to the workspace
    const { data: existingLabel } = await supabase
      .from('workspace_task_labels')
      .select('id, ws_id')
      .eq('id', labelId)
      .eq('ws_id', wsId)
      .single();

    if (!existingLabel) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 });
    }

    // Update the label
    const { data: updatedLabel, error: updateError } = await supabase
      .from('workspace_task_labels')
      .update({
        name: name.trim(),
        color: color,
      })
      .eq('id', labelId)
      .eq('ws_id', wsId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating label:', updateError);
      return NextResponse.json(
        { error: 'Failed to update label' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedLabel);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a label
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId, labelId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has access to the workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify the label exists and belongs to the workspace
    const { data: existingLabel } = await supabase
      .from('workspace_task_labels')
      .select('id, ws_id')
      .eq('id', labelId)
      .eq('ws_id', wsId)
      .single();

    if (!existingLabel) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 });
    }

    // Delete the label
    const { error: deleteError } = await supabase
      .from('workspace_task_labels')
      .delete()
      .eq('id', labelId)
      .eq('ws_id', wsId);

    if (deleteError) {
      console.error('Error deleting label:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete label' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
