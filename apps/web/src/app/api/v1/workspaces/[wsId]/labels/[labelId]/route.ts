import { createClient } from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  isTaskLabelColorPreset,
  normalizeTaskLabelColor,
} from '../label-color';

interface RouteParams {
  params: Promise<{
    wsId: string;
    labelId: string;
  }>;
}

const LabelSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  color: z
    .string()
    .trim()
    .min(1, 'Color is required')
    .transform((value) => normalizeTaskLabelColor(value))
    .refine((value) => isTaskLabelColorPreset(value), {
      message: 'Color must be one of the supported preset colors',
    }),
});

// PATCH - Update a label
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId: id, labelId } = await params;
    const supabase = await createClient(request);
    const wsId = await normalizeWorkspaceId(id, supabase);
    const body = await request.json();
    const data = LabelSchema.safeParse(body);

    if (!data.success) {
      console.error('Validation error:', data.error);
      return NextResponse.json(
        { error: 'Invalid label data' },
        { status: 400 }
      );
    }
    const { name, color } = data.data;

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
        color,
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
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId: id, labelId } = await params;
    const supabase = await createClient(request);
    const wsId = await normalizeWorkspaceId(id, supabase);

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
