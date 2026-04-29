import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_LONG_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateUpdateSchema = z.object({
  content: z
    .string()
    .max(MAX_LONG_TEXT_LENGTH)
    .trim()
    .min(1, 'Content cannot be empty'), // Plain text (TipTap handles JSONContent conversion)
});

const projectIdParamSchema = z.guid('Project ID must be a valid UUID');
const updateIdParamSchema = z.guid('Update ID must be a valid UUID');

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string; projectId: string; updateId: string }>;
  }
) {
  try {
    const { wsId: id, projectId, updateId } = await params;
    const validatedProjectId = projectIdParamSchema.safeParse(projectId);

    if (!validatedProjectId.success) {
      console.error('Invalid project ID:', validatedProjectId.error);
      return NextResponse.json(
        { error: validatedProjectId.error.message },
        { status: 400 }
      );
    }

    const validatedUpdateId = updateIdParamSchema.safeParse(updateId);
    if (!validatedUpdateId.success) {
      console.error('Invalid update ID:', validatedUpdateId.error);
      return NextResponse.json(
        { error: validatedUpdateId.error.message },
        { status: 400 }
      );
    }
    const supabase = await createClient(request);
    const wsId = await normalizeWorkspaceId(id, supabase);

    // Get current user
    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      console.error('Membership lookup failed:', membership.error);
      return NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    // Verify update exists and user is the creator
    const { data: existingUpdate, error: existingUpdateError } = await sbAdmin
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
      .eq('task_projects.ws_id', wsId)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingUpdateError) {
      console.error(
        'Error checking existing project update:',
        existingUpdateError
      );
      return NextResponse.json(
        { error: 'Failed to load update' },
        { status: 500 }
      );
    }

    if (!existingUpdate) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 });
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
    const { data: updatedUpdate, error: updateError } = await sbAdmin
      .from('task_project_updates')
      .update({ content })
      .eq('id', updateId)
      .eq('project_id', projectId)
      .eq('creator_id', user.id)
      .is('deleted_at', null)
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
      .maybeSingle();

    if (updateError) {
      console.error('Error updating project update:', updateError);
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    if (!updatedUpdate) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 });
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
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string; projectId: string; updateId: string }>;
  }
) {
  try {
    const { wsId: id, projectId, updateId } = await params;
    const validatedProjectId = projectIdParamSchema.safeParse(projectId);

    if (!validatedProjectId.success) {
      console.error('Invalid project ID:', validatedProjectId.error);
      return NextResponse.json(
        { error: validatedProjectId.error.message },
        { status: 400 }
      );
    }

    const validatedUpdateId = updateIdParamSchema.safeParse(updateId);
    if (!validatedUpdateId.success) {
      console.error('Invalid update ID:', validatedUpdateId.error);
      return NextResponse.json(
        { error: validatedUpdateId.error.message },
        { status: 400 }
      );
    }
    const supabase = await createClient(request);
    const wsId = await normalizeWorkspaceId(id, supabase);

    // Get current user
    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      console.error('Membership lookup failed:', membership.error);
      return NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    // Verify update exists and user is the creator
    const { data: existingUpdate, error: existingUpdateError } = await sbAdmin
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
      .eq('task_projects.ws_id', wsId)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingUpdateError) {
      console.error(
        'Error checking existing project update:',
        existingUpdateError
      );
      return NextResponse.json(
        { error: 'Failed to load update' },
        { status: 500 }
      );
    }

    if (!existingUpdate) {
      return NextResponse.json({ error: 'Update not found' }, { status: 404 });
    }

    // Only creator can delete
    if (existingUpdate.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the creator can delete this update' },
        { status: 403 }
      );
    }

    const { data: updatedRows, error: deleteError } = await sbAdmin
      .from('task_project_updates')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', updateId)
      .eq('creator_id', user.id)
      .select('id'); // Extra safety: double-check creator

    if (deleteError) {
      console.error('Error deleting project update:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete update' },
        { status: 500 }
      );
    }

    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: 'Update not found or already deleted' },
        { status: 404 }
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
