import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';

const createCommentSchema = z.object({
  content: z.string().trim().min(1, { message: 'Content cannot be empty' }),
});

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string; id: string }>;
  }
) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const { content } = createCommentSchema.parse(body);

    const { wsId, id: requestId } = await params;
    const resolvedWorkspaceId = resolveWorkspaceId(wsId);
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
      .eq('ws_id', resolvedWorkspaceId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify request exists and belongs to workspace
    const { data: requestExists } = await supabase
      .from('time_tracking_requests')
      .select('id')
      .eq('id', requestId)
      .eq('workspace_id', resolvedWorkspaceId)
      .single();

    if (!requestExists) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Create comment
    const { data: newComment, error: createError } = await supabase
      .from('time_tracking_request_comments')
      .insert({
        request_id: requestId,
        user_id: user.id,
        content,
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
      'Error in POST /api/v1/workspaces/[wsId]/time-tracking/requests/[requestId]/comments:',
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
    params: Promise<{ wsId: string; id: string }>;
  }
) {
  try {
    const { wsId, id: requestId } = await params;
    const resolvedWorkspaceId = resolveWorkspaceId(wsId);
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
      .eq('ws_id', resolvedWorkspaceId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify request exists and belongs to workspace
    const { data: requestExists } = await supabase
      .from('time_tracking_requests')
      .select('id')
      .eq('id', requestId)
      .eq('workspace_id', resolvedWorkspaceId)
      .single();

    if (!requestExists) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Fetch comments
    const { data: comments, error: fetchError } = await supabase
      .from('time_tracking_request_comments')
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
      .eq('request_id', requestId)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('Error fetching comments:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch comments' },
        { status: 500 }
      );
    }

    return NextResponse.json({ comments: comments || [] });
  } catch (error) {
    console.error(
      'Error in GET /api/v1/workspaces/[wsId]/time-tracking/requests/[requestId]/comments:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
