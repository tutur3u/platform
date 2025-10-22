import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createCommentSchema = z.object({
  content: z.string().trim().min(1, { message: 'Content cannot be empty' }), // Plain text (TipTap handles JSONContent conversion)
  parent_id: z.string().uuid().nullable().optional(),
});

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string; projectId: string; updateId: string }>;
  }
) {
  try {
    const { wsId, updateId } = await params;
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

    // Parse and validate request body
    const body = await request.json();
    const { content, parent_id } = createCommentSchema.parse(body);

    // Validate parent comment if parent_id is provided
    if (parent_id) {
      const { data: parentComment } = await supabase
        .from('task_project_update_comments')
        .select('id')
        .eq('id', parent_id)
        .eq('update_id', updateId)
        .is('deleted_at', null)
        .single();

      if (!parentComment) {
        return NextResponse.json(
          {
            error:
              'Parent comment not found, does not belong to this update, or has been deleted',
          },
          { status: 400 }
        );
      }
    }

    // Create comment
    const { data: newComment, error: createError } = await supabase
      .from('task_project_update_comments')
      .insert({
        update_id: updateId,
        user_id: user.id,
        content,
        parent_id: parent_id || null,
      })
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

    if (createError) {
      console.error('Error creating comment:', createError);
      return NextResponse.json(
        { error: 'Failed to create comment' },
        { status: 500 }
      );
    }

    return NextResponse.json(newComment, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'Error in POST /api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]/comments:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  _: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string; projectId: string; updateId: string }>;
  }
) {
  try {
    const { wsId, updateId } = await params;
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

    // Fetch comments
    const { data: comments, error: fetchError } = await supabase
      .from('task_project_update_comments')
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
      .eq('update_id', updateId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('Error fetching comments:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch comments' },
        { status: 500 }
      );
    }

    // Build threaded comment structure
    const commentMap = new Map<string, any>();
    const topLevelComments: any[] = [];

    // First pass: Create a map of all comments
    comments?.forEach((comment) => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // Second pass: Build the tree structure
    comments?.forEach((comment) => {
      if (comment.parent_id) {
        const parent = commentMap.get(comment.parent_id);
        if (parent) {
          parent.replies.push(commentMap.get(comment.id));
        }
      } else {
        topLevelComments.push(commentMap.get(comment.id));
      }
    });

    return NextResponse.json({ comments: topLevelComments });
  } catch (error) {
    console.error(
      'Error in GET /api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]/comments:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
