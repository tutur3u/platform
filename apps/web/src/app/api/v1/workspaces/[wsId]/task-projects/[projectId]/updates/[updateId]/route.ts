import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateUpdateSchema = z.object({
  content: z.string(), // Plain text (TipTap handles JSONContent conversion)
});

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string; projectId: string; updateId: string }>;
  }
) {
  try {
    const { wsId, projectId, updateId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify update exists and user is the creator
    const { data: existingUpdate } = await supabase
      .from('task_project_updates')
      .select(
        `
        id,
        creator_id,
        project_id,
        task_projects!inner(ws_id)
      `
      )
      .eq('id', updateId)
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .single();

    if (!existingUpdate) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 });
    }

    // Verify update belongs to the workspace
    if ((existingUpdate as any).task_projects?.ws_id !== wsId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only creator can edit
    if (existingUpdate.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the creator can edit this update' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { content } = updateUpdateSchema.parse(body);

    // Update the update
    const { data: updatedUpdate, error: updateError } = await supabase
      .from('task_project_updates')
      .update({ content })
      .eq('id', updateId)
      .select(
        `
        *,
        creator:users!task_project_updates_creator_id_fkey(
          id,
          display_name,
          avatar_url
        )
      `
      )
      .single();

    if (updateError) {
      console.error('Error updating project update:', updateError);
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    return NextResponse.json(updatedUpdate);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'Error in PATCH /api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string; projectId: string; updateId: string }>;
  }
) {
  try {
    const { wsId, projectId, updateId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify update exists and user is the creator
    const { data: existingUpdate } = await supabase
      .from('task_project_updates')
      .select(
        `
        id,
        creator_id,
        project_id,
        task_projects!inner(ws_id)
      `
      )
      .eq('id', updateId)
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .single();

    if (!existingUpdate) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 });
    }

    // Verify update belongs to the workspace
    if ((existingUpdate as any).task_projects?.ws_id !== wsId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only creator can delete
    if (existingUpdate.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the creator can delete this update' },
        { status: 403 }
      );
    }

    // Soft delete the update using admin client (bypasses RLS after permission verification)
    const sbAdmin = await createAdminClient();

    const { error: deleteError } = await sbAdmin
      .from('task_project_updates')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', updateId)
      .eq('creator_id', user.id); // Extra safety: double-check creator

    if (deleteError) {
      console.error('Error deleting project update:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete update' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      'Error in DELETE /api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
