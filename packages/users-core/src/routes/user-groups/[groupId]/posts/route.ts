import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { getWorkspaceUserLinkForUser } from '@tuturuuu/utils/workspace-user-link';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateUserGroupCache } from '../../../../lib/user-groups/revalidate';
import { getUserGroupRoutePermissions } from '../../../../lib/user-groups/route-auth';
import {
  hasUserGroupInWorkspace,
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '../../../../lib/user-groups/route-helpers';

const GroupPostSchema = z.object({
  title: z.string().max(MAX_NAME_LENGTH).nullable().optional(),
  content: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  notes: z.string().max(MAX_MEDIUM_TEXT_LENGTH).nullable().optional(),
});

const GroupUuidSchema = z.object({ groupId: z.guid() });

interface Params {
  params: Promise<{ groupId: string; wsId: string }>;
}

export async function GET(req: Request, { params }: Params) {
  const { groupId, wsId: rawWsId } = await params;
  const parsedParams = GroupUuidSchema.safeParse({ groupId });
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid path params', errors: parsedParams.error.issues },
      { status: 400 }
    );
  }

  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, req);
  const permissions = await getUserGroupRoutePermissions(wsId, req);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (permissions.withoutPermission('view_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user group posts' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  try {
    if (!(await hasUserGroupInWorkspace({ sbAdmin, wsId, groupId }))) {
      return NextResponse.json(
        { message: 'User group not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Error resolving user group workspace', {
      error,
      groupId,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error resolving user group workspace' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor');
  const parsedLimit = Number.parseInt(searchParams.get('limit') ?? '10', 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 1000)
    : 10;

  let query = sbAdmin
    .schema('private')
    .from('user_group_posts')
    .select('*', { count: 'exact' })
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) query = query.lt('created_at', cursor);

  const { data, error, count } = await query;
  if (error) {
    console.error('Error fetching user group posts', { error, groupId, wsId });
    return NextResponse.json(
      { message: 'Error fetching user group posts' },
      { status: 500 }
    );
  }

  const posts = data ?? [];
  return NextResponse.json({
    count: count ?? 0,
    data: posts,
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

  const parsedBody = GroupPostSchema.safeParse(rawBody);
  const { groupId, wsId: rawWsId } = await params;
  const parsedParams = GroupUuidSchema.safeParse({ groupId });
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid path params', errors: parsedParams.error.issues },
      { status: 400 }
    );
  }
  if (!parsedBody.success) {
    return NextResponse.json(
      { message: 'Invalid data', errors: parsedBody.error.issues },
      { status: 400 }
    );
  }

  const actorAuthUid = await resolveRequestActorAuthUid(req);
  if (!actorAuthUid) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, req);
  const permissions = await getUserGroupRoutePermissions(wsId, req);
  if (!permissions) {
    return NextResponse.json(
      { error: 'Failed to resolve permissions' },
      { status: 404 }
    );
  }
  if (permissions.withoutPermission('create_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create user group posts' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data: group, error: groupError } = await sbAdmin
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

  const { data: approvalConfig, error: approvalConfigError } = await sbAdmin
    .from('workspace_configs')
    .select('value')
    .eq('ws_id', wsId)
    .eq('id', 'ENABLE_POST_APPROVAL')
    .maybeSingle();

  if (approvalConfigError) {
    return NextResponse.json(
      { message: 'Error resolving post approval settings' },
      { status: 500 }
    );
  }

  const actorLink = await getWorkspaceUserLinkForUser(wsId, actorAuthUid, {
    authorizationClient: sbAdmin,
  });
  if (!actorLink?.virtual_user_id) {
    return NextResponse.json(
      { message: 'Workspace user mapping not found' },
      { status: 403 }
    );
  }

  const enablePostApproval = (approvalConfig?.value ?? 'true') === 'true';
  const actorVirtualUserId = actorLink.virtual_user_id;
  const { error } = await sbAdmin
    .schema('private')
    .from('user_group_posts')
    .insert({
      ...parsedBody.data,
      group_id: groupId,
      creator_id: actorVirtualUserId,
      updated_by: actorVirtualUserId,
      ...(enablePostApproval
        ? {}
        : {
            post_approval_status: 'APPROVED',
            approved_by: actorVirtualUserId,
            approved_at: new Date().toISOString(),
            rejected_by: null,
            rejected_at: null,
            rejection_reason: null,
          }),
    });

  if (error) {
    console.error('Error creating group post', { error, groupId, wsId });
    return NextResponse.json(
      { message: 'Error creating group post' },
      { status: 500 }
    );
  }

  revalidateUserGroupCache(groupId);
  return NextResponse.json({ message: 'success' });
}
