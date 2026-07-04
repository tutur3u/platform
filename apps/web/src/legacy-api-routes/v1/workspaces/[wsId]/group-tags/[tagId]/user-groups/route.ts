import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const AddGroupsSchema = z.object({
  groupIds: z.array(z.string()).default([]),
});

interface Params {
  params: Promise<{
    wsId: string;
    tagId: string;
  }>;
}

async function ensureTagBelongsToWorkspace(wsId: string, tagId: string) {
  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('workspace_user_group_tags')
    .select('id')
    .eq('ws_id', wsId)
    .eq('id', tagId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, tagId } = await params;
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
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sbAdmin = await createAdminClient();
  let tagExists = false;
  try {
    tagExists = await ensureTagBelongsToWorkspace(wsId, tagId);
  } catch (error) {
    console.error('Error checking workspace user group tag', error);
    return NextResponse.json(
      { message: 'Error fetching user groups' },
      { status: 500 }
    );
  }

  if (!tagExists) {
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
  const { wsId, tagId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sbAdmin = await createAdminClient();
  let tagExists = false;
  try {
    tagExists = await ensureTagBelongsToWorkspace(wsId, tagId);
  } catch (error) {
    console.error('Error checking workspace user group tag', error);
    return NextResponse.json(
      { message: 'Error adding new groups to tag' },
      { status: 500 }
    );
  }

  if (!tagExists) {
    return NextResponse.json(
      { message: 'Workspace user group tag not found' },
      { status: 404 }
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

  const parsed = AddGroupsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const groupIds = Array.from(new Set(parsed.data.groupIds));

  if (groupIds.length === 0) {
    return NextResponse.json({ message: 'success' });
  }

  const { data: groups, error: groupsError } = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('ws_id', wsId)
    .in('id', groupIds);

  if (groupsError) {
    console.error(
      'Error validating workspace user groups for tag',
      groupsError
    );
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
    console.error('Error adding new groups to tag', tagError);
    return NextResponse.json(
      { message: 'Error adding new groups to tag' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
