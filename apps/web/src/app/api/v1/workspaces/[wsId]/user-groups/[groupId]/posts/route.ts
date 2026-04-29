import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  getWorkspaceUser,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const CreateGroupPostSchema = z.object({
  title: z.string().max(MAX_NAME_LENGTH).nullable().optional(),
  content: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  notes: z.string().max(MAX_MEDIUM_TEXT_LENGTH).nullable().optional(),
});

const GroupUuidSchema = z.object({
  groupId: z.guid(),
});

interface Params {
  params: Promise<{
    groupId: string;
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { groupId, wsId } = await params;
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor');
  const limit = Number.parseInt(searchParams.get('limit') ?? '10', 10);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user group posts' },
      { status: 403 }
    );
  }

  const supabase = await createAdminClient();
  let query = supabase
    .from('user_group_posts')
    .select('*', { count: 'exact' })
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error, count } = await query;

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching user group posts' },
      { status: 500 }
    );
  }

  const posts = data ?? [];
  return NextResponse.json({
    data: posts,
    count: count ?? 0,
    nextCursor:
      posts.length === limit
        ? (posts[posts.length - 1]?.created_at ?? null)
        : null,
  });
}

export async function POST(req: Request, { params }: Params) {
  let rawBody: unknown;

  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const parsedBody = CreateGroupPostSchema.safeParse(rawBody);
  const { groupId, wsId: id } = await params;

  const pathParamsParse = GroupUuidSchema.safeParse({
    groupId,
  });

  if (!pathParamsParse.success) {
    return NextResponse.json(
      {
        message: 'Invalid path params',
        errors: pathParamsParse.error.issues,
      },
      { status: 400 }
    );
  }

  if (!parsedBody.success) {
    return NextResponse.json(
      { message: 'Invalid data', errors: parsedBody.error.issues },
      { status: 400 }
    );
  }

  const data = parsedBody.data;

  const userSupabase = await createClient(req);
  const { user, authError: userError } =
    await resolveAuthenticatedSessionUser(userSupabase);
  if (userError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const wsId = await normalizeWorkspaceId(id, userSupabase);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json(
      { error: 'Failed to resolve permissions' },
      { status: 404 }
    );
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('create_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create user group posts' },
      { status: 403 }
    );
  }

  const supabase = await createAdminClient();
  const { data: group, error: groupError } = await supabase
    .from('workspace_user_groups')
    .select('ws_id')
    .eq('id', groupId)
    .maybeSingle();

  if (groupError) {
    return NextResponse.json(
      { message: 'Error resolving user group workspace' },
      { status: 500 }
    );
  }

  if (!group) {
    return NextResponse.json(
      { message: 'User group not found' },
      { status: 404 }
    );
  }

  if (group.ws_id !== wsId) {
    return NextResponse.json(
      { message: 'User group does not belong to the specified workspace' },
      { status: 400 }
    );
  }

  const { data: approvalConfig, error: approvalConfigError } = await supabase
    .from('workspace_configs')
    .select('value')
    .eq('ws_id', group.ws_id)
    .eq('id', 'ENABLE_POST_APPROVAL')
    .maybeSingle();

  if (approvalConfigError) {
    return NextResponse.json(
      { message: 'Error resolving post approval settings' },
      { status: 500 }
    );
  }

  const enablePostApproval = (approvalConfig?.value ?? 'true') === 'true';
  const workspaceUser = await getWorkspaceUser(wsId, user.id);

  if (!workspaceUser?.virtual_user_id) {
    return NextResponse.json(
      { message: 'Workspace user mapping not found' },
      { status: 403 }
    );
  }

  const { error } = await supabase.from('user_group_posts').insert({
    ...data,
    group_id: groupId,
    creator_id: workspaceUser.virtual_user_id,
    updated_by: workspaceUser.virtual_user_id,
    ...(enablePostApproval
      ? {}
      : {
          post_approval_status: 'APPROVED',
          approved_by: workspaceUser.virtual_user_id,
          approved_at: new Date().toISOString(),
          rejected_by: null,
          rejected_at: null,
          rejection_reason: null,
        }),
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating group post' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
