import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { NextResponse } from 'next/server';
import {
  AddGroupTagGroupsSchema,
  GroupTagParamsSchema,
  loadWorkspaceGroupTag,
  loadWorkspaceUserGroups,
} from '../../validation';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

interface Params {
  params: Promise<{
    wsId: string;
    tagId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const parsedParams = GroupTagParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid route params' },
      { status: 400 }
    );
  }
  const { wsId, tagId } = parsedParams.data;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const page = Math.max(
    Number.parseInt(searchParams.get('page') ?? '1', 10) || 1,
    1
  );
  const pageSize = Math.min(
    Math.max(
      Number.parseInt(
        searchParams.get('pageSize') ?? `${DEFAULT_PAGE_SIZE}`,
        10
      ) || DEFAULT_PAGE_SIZE,
      1
    ),
    MAX_PAGE_SIZE
  );

  // Check permissions
  const permissions = await getUserGroupRoutePermissions(wsId, req);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (permissions.withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user group tags' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data: tag, error: tagError } = await loadWorkspaceGroupTag(
    sbAdmin,
    wsId,
    tagId
  );
  if (tagError) {
    console.error('Error checking workspace user group tag');
    return NextResponse.json(
      { message: 'Error fetching user groups' },
      { status: 500 }
    );
  }

  if (!tag) {
    return NextResponse.json(
      { message: 'Workspace user group tag not found' },
      { status: 404 }
    );
  }

  const queryBuilder = sbAdmin
    .from('workspace_user_group_tag_groups')
    .select('...workspace_user_groups!inner(*)', {
      count: 'exact',
    })
    .eq('tag_id', tagId)
    .eq('workspace_user_groups.ws_id', wsId);

  if (q) {
    queryBuilder.ilike('workspace_user_groups.name', `%${q}%`);
  }

  const from = (page - 1) * pageSize;
  queryBuilder.range(from, from + pageSize - 1);

  const { data, error, count } = await queryBuilder;

  if (error) {
    console.error('Error fetching user groups for tag', error);
    return NextResponse.json(
      { message: 'Error fetching user groups' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data || [],
    count: count || 0,
    page,
    pageSize,
  });
}

export async function POST(req: Request, { params }: Params) {
  const parsedParams = GroupTagParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid route params' },
      { status: 400 }
    );
  }
  const { wsId, tagId } = parsedParams.data;

  // Check permissions
  const permissions = await getUserGroupRoutePermissions(wsId, req);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (permissions.withoutPermission('update_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update user group tags' },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid JSON request body' },
      { status: 400 }
    );
  }

  const parsed = AddGroupTagGroupsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { groupIds } = parsed.data;

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data: tag, error: tagLookupError } = await loadWorkspaceGroupTag(
    sbAdmin,
    wsId,
    tagId
  );
  if (tagLookupError) {
    console.error('Error checking workspace user group tag');
    return NextResponse.json(
      { message: 'Error adding new groups to tag' },
      { status: 500 }
    );
  }
  if (!tag) {
    return NextResponse.json(
      { message: 'Workspace user group tag not found' },
      { status: 404 }
    );
  }

  if (groupIds.length === 0) {
    return NextResponse.json({ message: 'success' });
  }

  const { data: groups, error: groupsError } = await loadWorkspaceUserGroups(
    sbAdmin,
    wsId,
    groupIds
  );

  if (groupsError) {
    console.error('Error validating workspace user groups for tag');
    return NextResponse.json(
      { message: 'Error adding new groups to tag' },
      { status: 500 }
    );
  }

  if ((groups?.length ?? 0) !== groupIds.length) {
    return NextResponse.json(
      { message: 'One or more user groups were not found' },
      { status: 404 }
    );
  }

  const { error: tagError } = await sbAdmin
    .from('workspace_user_group_tag_groups')
    .insert(
      groupIds.map((groupId) => ({
        group_id: groupId,
        tag_id: tagId,
      }))
    );

  if (tagError) {
    if (tagError.code === '23505') {
      return NextResponse.json(
        { message: 'One or more user groups are already linked to this tag' },
        { status: 409 }
      );
    }
    console.error('Error adding new groups to tag');
    return NextResponse.json(
      { message: 'Error adding new groups to tag' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
