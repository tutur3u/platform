import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

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
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
      message: 'Color must be a valid hex color code',
    }),
});

const LabelIdSchema = z.guid();

// PATCH - Update a label
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId: id, labelId } = await params;
    const parsedLabelId = LabelIdSchema.safeParse(labelId);
    if (!parsedLabelId.success) {
      return NextResponse.json(
        { error: 'Invalid labelId: must be a valid UUID' },
        { status: 400 }
      );
    }

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

    // Get current user
    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const validatedLabelId = parsedLabelId.data;
    const { name, color } = data.data;

    // Check if user has access to the workspace
    const workspaceMember = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (workspaceMember.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!workspaceMember.ok) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify the label exists and belongs to the workspace
    const { data: existingLabel } = await supabase
      .from('workspace_task_labels')
      .select('id, ws_id')
      .eq('id', validatedLabelId)
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
      .eq('id', validatedLabelId)
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

    // Get current user
    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsedLabelId = LabelIdSchema.safeParse(labelId);
    if (!parsedLabelId.success) {
      return NextResponse.json(
        { error: 'Invalid labelId: must be a valid UUID' },
        { status: 400 }
      );
    }
    const validatedLabelId = parsedLabelId.data;

    const wsId = await normalizeWorkspaceId(id, supabase);

    // Check if user has access to the workspace
    const workspaceMember = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (workspaceMember.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!workspaceMember.ok) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify the label exists and belongs to the workspace
    const { data: existingLabel } = await supabase
      .from('workspace_task_labels')
      .select('id, ws_id')
      .eq('id', validatedLabelId)
      .eq('ws_id', wsId)
      .single();

    if (!existingLabel) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 });
    }

    // Delete the label
    const { error: deleteError } = await supabase
      .from('workspace_task_labels')
      .delete()
      .eq('id', validatedLabelId)
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
