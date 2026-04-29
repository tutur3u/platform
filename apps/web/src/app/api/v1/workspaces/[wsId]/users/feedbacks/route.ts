import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  buildWorkspaceFeedbacksQuery,
  CreateWorkspaceFeedbackSchema,
  FeedbackContentSchema,
  FeedbackListSearchParamsSchema,
  normalizeWorkspaceFeedback,
} from './shared';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
  const permissions = await getPermissions({ wsId, request });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (permissions.withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view feedback' },
      { status: 403 }
    );
  }

  const parsed = FeedbackListSearchParamsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data, error, count } = await buildWorkspaceFeedbacksQuery(sbAdmin, {
    wsId,
    ...parsed.data,
  });

  if (error) {
    console.error('Error fetching workspace feedbacks:', error);
    return NextResponse.json(
      { message: 'Error fetching feedbacks' },
      { status: 500 }
    );
  }

  const items = (data ?? []).map(normalizeWorkspaceFeedback);

  return NextResponse.json({
    data: items,
    count: count ?? 0,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / parsed.data.pageSize)),
  });
}

export async function POST(request: Request, { params }: Params) {
  const { wsId } = await params;
  const permissions = await getPermissions({ wsId, request });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!permissions.containsPermission('update_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage feedback' },
      { status: 403 }
    );
  }

  const parsed = CreateWorkspaceFeedbackSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient(request);
  const sbAdmin = await createAdminClient();
  const { user: authUser } = await resolveAuthenticatedSessionUser(supabase);

  if (!authUser) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const [
    { data: wsUser, error: wsUserError },
    { data: targetUser },
    { data: group },
  ] = await Promise.all([
    sbAdmin
      .from('workspace_user_linked_users')
      .select('virtual_user_id')
      .eq('platform_user_id', authUser.id)
      .eq('ws_id', wsId)
      .maybeSingle(),
    sbAdmin
      .from('workspace_users')
      .select('id')
      .eq('id', parsed.data.userId)
      .eq('ws_id', wsId)
      .maybeSingle(),
    sbAdmin
      .from('workspace_user_groups')
      .select('id')
      .eq('id', parsed.data.groupId)
      .eq('ws_id', wsId)
      .maybeSingle(),
  ]);

  if (wsUserError || !wsUser) {
    return NextResponse.json(
      { message: 'User not found in workspace' },
      { status: 403 }
    );
  }

  if (!targetUser || !group) {
    return NextResponse.json(
      { message: 'User or group not found in workspace' },
      { status: 404 }
    );
  }

  const { error } = await sbAdmin.from('user_feedbacks').insert({
    user_id: parsed.data.userId,
    group_id: parsed.data.groupId,
    content: parsed.data.content.trim(),
    require_attention: parsed.data.require_attention ?? false,
    creator_id: wsUser.virtual_user_id,
  });

  if (error) {
    console.error('Error creating workspace feedback:', error);
    return NextResponse.json(
      { message: 'Error creating feedback' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function PUT(request: Request, { params }: Params) {
  const { wsId } = await params;
  const permissions = await getPermissions({ wsId, request });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!permissions.containsPermission('update_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage feedback' },
      { status: 403 }
    );
  }

  const feedbackId = new URL(request.url).searchParams.get('feedbackId');

  if (!feedbackId) {
    return NextResponse.json(
      { message: 'Feedback ID is required' },
      { status: 400 }
    );
  }

  const parsed = FeedbackContentSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data: existingFeedback, error: fetchError } = await sbAdmin
    .from('user_feedbacks')
    .select('id, user:workspace_users!user_feedbacks_user_id_fkey!inner(ws_id)')
    .eq('id', feedbackId)
    .eq('user.ws_id', wsId)
    .maybeSingle();

  if (fetchError || !existingFeedback) {
    return NextResponse.json(
      { message: 'Feedback not found' },
      { status: 404 }
    );
  }

  const { error } = await sbAdmin
    .from('user_feedbacks')
    .update({
      content: parsed.data.content.trim(),
      require_attention: parsed.data.require_attention,
    })
    .eq('id', feedbackId);

  if (error) {
    console.error('Error updating workspace feedback:', error);
    return NextResponse.json(
      { message: 'Error updating feedback' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(request: Request, { params }: Params) {
  const { wsId } = await params;
  const permissions = await getPermissions({ wsId, request });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!permissions.containsPermission('update_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage feedback' },
      { status: 403 }
    );
  }

  const feedbackId = new URL(request.url).searchParams.get('feedbackId');

  if (!feedbackId) {
    return NextResponse.json(
      { message: 'Feedback ID is required' },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data: existingFeedback, error: fetchError } = await sbAdmin
    .from('user_feedbacks')
    .select('id, user:workspace_users!user_feedbacks_user_id_fkey!inner(ws_id)')
    .eq('id', feedbackId)
    .eq('user.ws_id', wsId)
    .maybeSingle();

  if (fetchError || !existingFeedback) {
    return NextResponse.json(
      { message: 'Feedback not found' },
      { status: 404 }
    );
  }

  const { error } = await sbAdmin
    .from('user_feedbacks')
    .delete()
    .eq('id', feedbackId);

  if (error) {
    console.error('Error deleting workspace feedback:', error);
    return NextResponse.json(
      { message: 'Error deleting feedback' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
