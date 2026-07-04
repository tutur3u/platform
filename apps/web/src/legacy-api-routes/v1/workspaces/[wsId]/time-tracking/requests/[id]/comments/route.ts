import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  MAX_LONG_TEXT_LENGTH,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';

const createCommentSchema = z.object({
  content: z
    .string()
    .max(MAX_LONG_TEXT_LENGTH)
    .trim()
    .min(1, { message: 'Content cannot be empty' }),
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
    let supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    // Get current user
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: true,
    });
    if (!auth.ok) return auth.response;
    const { user } = auth;
    supabase = auth.supabase;

    // Verify user has access to workspace
    const membership = await verifyWorkspaceMembershipType({
      wsId: resolvedWorkspaceId,
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

    // Verify request exists and belongs to workspace
    const { data: requestExists, error: requestError } = await sbAdmin
      .schema('private')
      .from('time_tracking_requests')
      .select('id')
      .eq('id', requestId)
      .eq('workspace_id', resolvedWorkspaceId)
      .single();

    if (requestError) {
      return NextResponse.json(
        { error: 'Failed to verify request' },
        { status: 500 }
      );
    }

    if (!requestExists) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Create comment
    const { data: newComment, error: createError } = await sbAdmin
      .schema('private')
      .from('time_tracking_request_comments')
      .insert({
        request_id: requestId,
        user_id: user.id,
        content,
      })
      .select('id')
      .single();

    if (createError) {
      console.error('Error creating comment:', createError);
      return NextResponse.json(
        { error: 'Failed to create comment' },
        { status: 500 }
      );
    }

    const { data: commentWithUser, error: fetchCommentError } = await sbAdmin
      .schema('private')
      .from('time_tracking_request_comments_with_users')
      .select('*')
      .eq('id', newComment.id)
      .single();

    if (fetchCommentError) {
      console.error('Error fetching created comment:', fetchCommentError);
      return NextResponse.json(
        { error: 'Failed to fetch created comment' },
        { status: 500 }
      );
    }

    return NextResponse.json(commentWithUser, { status: 201 });
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
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string; id: string }>;
  }
) {
  try {
    const { wsId, id: requestId } = await params;
    const resolvedWorkspaceId = resolveWorkspaceId(wsId);
    let supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    // Get current user
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: true,
    });
    if (!auth.ok) return auth.response;
    const { user } = auth;
    supabase = auth.supabase;

    // Verify user has access to workspace
    const membership = await verifyWorkspaceMembershipType({
      wsId: resolvedWorkspaceId,
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

    // Verify request exists and belongs to workspace
    const { data: requestExists, error: requestError } = await sbAdmin
      .schema('private')
      .from('time_tracking_requests')
      .select('id')
      .eq('id', requestId)
      .eq('workspace_id', resolvedWorkspaceId)
      .single();

    if (requestError) {
      return NextResponse.json(
        { error: 'Failed to verify request' },
        { status: 500 }
      );
    }

    if (!requestExists) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Fetch comments
    const { data: comments, error: fetchError } = await sbAdmin
      .schema('private')
      .from('time_tracking_request_comments_with_users')
      .select('*')
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
