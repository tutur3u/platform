import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateCommentSchema = z.object({
  content: z.string(), // Plain text (TipTap handles JSONContent conversion)
});

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      wsId: string;
      projectId: string;
      updateId: string;
      commentId: string;
    }>;
  }
) {
  try {
    const { wsId, commentId } = await params;
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

    // Verify comment exists and user is the creator
    const { data: existingComment } = await supabase
      .from('task_project_update_comments')
      .select('id, user_id')
      .eq('id', commentId)
      .is('deleted_at', null)
      .single();

    if (!existingComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Only creator can edit
    if (existingComment.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the creator can edit this comment' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { content } = updateCommentSchema.parse(body);

    // Update comment
    const { data: updatedComment, error: updateError } = await supabase
      .from('task_project_update_comments')
      .update({ content })
      .eq('id', commentId)
      .select(
        `
        *,
        user:users(
          id,
          display_name,
          avatar_url
        )
      `
      )
      .single();

    if (updateError) {
      console.error('Error updating comment:', updateError);
      return NextResponse.json(
        { error: 'Failed to update comment' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedComment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'Error in PATCH /api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]/comments/[commentId]:',
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
    params: Promise<{
      wsId: string;
      projectId: string;
      updateId: string;
      commentId: string;
    }>;
  }
) {
  try {
    const { wsId, commentId } = await params;
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

    // Verify comment exists and user is the creator
    const { data: existingComment } = await supabase
      .from('task_project_update_comments')
      .select('id, user_id')
      .eq('id', commentId)
      .is('deleted_at', null)
      .single();

    if (!existingComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Only creator can delete
    if (existingComment.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the creator can delete this comment' },
        { status: 403 }
      );
    }

    // Soft delete comment using admin client (bypasses RLS after permission verification)
    const sbAdmin = await createAdminClient();

    const { error: deleteError } = await sbAdmin
      .from('task_project_update_comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', commentId)
      .eq('user_id', user.id); // Extra safety: double-check user owns this comment

    if (deleteError) {
      console.error('Error deleting comment:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete comment' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      'Error in DELETE /api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]/comments/[commentId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
