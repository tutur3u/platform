import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_LONG_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateCommentSchema = z.object({
  content: z
    .string()
    .max(MAX_LONG_TEXT_LENGTH)
    .trim()
    .min(1, { message: 'Content cannot be empty' }),
});

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string; id: string; commentId: string }>;
  }
) {
  try {
    const { wsId, id: requestId, commentId } = await params;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

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
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse and validate request body
    const body = await request.json();
    const { content } = updateCommentSchema.parse(body);

    // Get comment to verify ownership and time window
    const { data: existingComment } = await sbAdmin
      .from('time_tracking_request_comments')
      .select('user_id, created_at')
      .eq('id', commentId)
      .eq('request_id', requestId)
      .single();

    if (!existingComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Verify ownership
    if (existingComment.user_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only edit your own comments' },
        { status: 403 }
      );
    }

    // Verify 15-minute edit window
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const commentCreatedAt = new Date(existingComment.created_at);
    if (commentCreatedAt < fifteenMinutesAgo) {
      return NextResponse.json(
        { error: 'Can only edit within 15 minutes' },
        { status: 403 }
      );
    }

    // Update comment
    const { data: updatedComment, error: updateError } = await sbAdmin
      .from('time_tracking_request_comments')
      .update({
        content,
        updated_at: new Date().toISOString(),
      })
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
      'Error in PATCH /api/v1/workspaces/[wsId]/time-tracking/requests/[requestId]/comments/[commentId]:',
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
    params: Promise<{ wsId: string; id: string; commentId: string }>;
  }
) {
  try {
    const { wsId, id: requestId, commentId } = await params;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    // Get current user
    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get comment to verify ownership and time window
    const { data: existingComment } = await sbAdmin
      .from('time_tracking_request_comments')
      .select('user_id, created_at')
      .eq('id', commentId)
      .eq('request_id', requestId)
      .single();

    if (!existingComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Verify ownership
    if (existingComment.user_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only delete your own comments' },
        { status: 403 }
      );
    }

    // Verify 15-minute deletion window
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const commentCreatedAt = new Date(existingComment.created_at);
    if (commentCreatedAt < fifteenMinutesAgo) {
      return NextResponse.json(
        { error: 'Can only delete within 15 minutes' },
        { status: 403 }
      );
    }

    // Delete comment
    const { error: deleteError } = await sbAdmin
      .from('time_tracking_request_comments')
      .delete()
      .eq('id', commentId);

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
      'Error in DELETE /api/v1/workspaces/[wsId]/time-tracking/requests/[requestId]/comments/[commentId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
