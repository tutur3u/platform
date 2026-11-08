import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { denyWeakContentEdit } from '@/lib/tutoring/weak-content-access';
import { revalidateUserGroupCache } from '@/lib/user-groups/revalidate';
import {
  FeedbackContentSchema,
  normalizeWorkspaceFeedback,
} from '../../../../../users/feedbacks/shared';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
    userId: string;
  }>;
}

async function hasFeedbackScope(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  groupId: string,
  userId: string
) {
  const [user, group] = await Promise.all([
    sbAdmin
      .from('workspace_users')
      .select('id')
      .eq('id', userId)
      .eq('ws_id', wsId)
      .maybeSingle(),
    sbAdmin
      .from('workspace_user_groups')
      .select('id')
      .eq('id', groupId)
      .eq('ws_id', wsId)
      .maybeSingle(),
  ]);
  return (
    !user.error && !group.error && Boolean(user.data) && Boolean(group.data)
  );
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, groupId, userId } = await params;
  const { searchParams } = new URL(req.url);
  const offset = Number.parseInt(searchParams.get('offset') ?? '0', 10);
  const limit = Number.parseInt(searchParams.get('limit') ?? '10', 10);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user groups' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  if (!(await hasFeedbackScope(sbAdmin, permissions.wsId, groupId, userId))) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const { data, error, count } = await sbAdmin
    .from('user_feedbacks')
    .select(
      `
      id,
      content,
      require_attention,
      created_at,
      creator_id,
      creator:workspace_users!user_feedbacks_creator_id_fkey(
        full_name,
        display_name
      )
    `,
      { count: 'exact' }
    )
    .eq('user_id', userId)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching feedbacks' },
      { status: 500 }
    );
  }

  const feedbacks = (data || []).map((feedback) =>
    normalizeWorkspaceFeedback({
      ...feedback,
      user_id: userId,
      group_id: groupId,
      user: null,
      group: null,
      creator: feedback.creator
        ? {
            id: null,
            full_name: feedback.creator.full_name,
            display_name: feedback.creator.display_name,
            email: null,
          }
        : null,
    })
  );

  return NextResponse.json({
    data: feedbacks,
    count: count || 0,
    hasMore: (count || 0) > offset + limit,
  });
}

export async function POST(req: Request, { params }: Params) {
  const { wsId, groupId, userId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('update_user_groups_scores')) {
    // Reusing update_user_groups_scores for feedbacks as per existing logic
    return NextResponse.json(
      { message: 'Insufficient permissions to manage feedback' },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = FeedbackContentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { content, require_attention } = parsed.data;

  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  if (!(await hasFeedbackScope(sbAdmin, permissions.wsId, groupId, userId))) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  const denied = await denyWeakContentEdit({
    permissions,
    sbAdmin,
    touchesWeakContent: require_attention,
    wsId: permissions.wsId,
  });
  if (denied) return denied;

  const { user: authUser } = await resolveAuthenticatedSessionUser(supabase);
  if (!authUser) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data: wsUser, error: wsUserError } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', authUser.id)
    .eq('ws_id', permissions.wsId)
    .maybeSingle();

  if (wsUserError || !wsUser) {
    return NextResponse.json(
      { message: 'User not found in workspace' },
      { status: 403 }
    );
  }

  const { error } = await sbAdmin.from('user_feedbacks').insert({
    user_id: userId,
    group_id: groupId,
    content: content.trim(),
    require_attention: require_attention || false,
    creator_id: wsUser.virtual_user_id,
  });

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error creating feedback' },
      { status: 500 }
    );
  }

  revalidateUserGroupCache(groupId);
  return NextResponse.json({ message: 'success' });
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId, groupId, userId } = await params;
  const { searchParams } = new URL(req.url);
  const feedbackId = searchParams.get('feedbackId');

  if (!feedbackId) {
    return NextResponse.json(
      { message: 'Feedback ID is required' },
      { status: 400 }
    );
  }

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('update_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage feedback' },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = FeedbackContentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { content, require_attention } = parsed.data;

  const sbAdmin = await createAdminClient();
  if (!(await hasFeedbackScope(sbAdmin, permissions.wsId, groupId, userId))) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  // Verify feedback belongs to the workspace and group
  const { data: existingFeedback, error: fetchError } = await sbAdmin
    .from('user_feedbacks')
    .select('id, require_attention')
    .eq('id', feedbackId)
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError || !existingFeedback) {
    return NextResponse.json(
      { message: 'Feedback not found' },
      { status: 404 }
    );
  }

  const denied = await denyWeakContentEdit({
    permissions,
    sbAdmin,
    touchesWeakContent: existingFeedback.require_attention || require_attention,
    wsId: permissions.wsId,
  });
  if (denied) return denied;

  const { error } = await sbAdmin
    .from('user_feedbacks')
    .update({
      content: content.trim(),
      require_attention: require_attention,
    })
    .eq('id', feedbackId);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error updating feedback' },
      { status: 500 }
    );
  }

  revalidateUserGroupCache(groupId);
  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId, groupId, userId } = await params;
  const { searchParams } = new URL(req.url);
  const feedbackId = searchParams.get('feedbackId');

  if (!feedbackId) {
    return NextResponse.json(
      { message: 'Feedback ID is required' },
      { status: 400 }
    );
  }

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('update_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage feedback' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  if (!(await hasFeedbackScope(sbAdmin, permissions.wsId, groupId, userId))) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  // Verify feedback belongs to the workspace and group
  const { data: existingFeedback, error: fetchError } = await sbAdmin
    .from('user_feedbacks')
    .select('id, require_attention')
    .eq('id', feedbackId)
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError || !existingFeedback) {
    return NextResponse.json(
      { message: 'Feedback not found' },
      { status: 404 }
    );
  }

  const denied = await denyWeakContentEdit({
    permissions,
    sbAdmin,
    touchesWeakContent: existingFeedback.require_attention,
    wsId: permissions.wsId,
  });
  if (denied) return denied;

  const { error } = await sbAdmin
    .from('user_feedbacks')
    .delete()
    .eq('id', feedbackId);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error deleting feedback' },
      { status: 500 }
    );
  }

  revalidateUserGroupCache(groupId);
  return NextResponse.json({ message: 'success' });
}
