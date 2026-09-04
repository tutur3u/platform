import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CreateGroupTagSchema, loadWorkspaceUserGroups } from './validation';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const ParamsSchema = z.object({ wsId: z.string().min(1) });

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

export async function GET(request: Request, { params }: Params) {
  const parsedParams = ParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid route params' },
      { status: 400 }
    );
  }
  const { wsId: id } = parsedParams.data;
  const permissions = await getUserGroupRoutePermissions(id, request);
  if (!permissions) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  if (permissions.withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user group tags' },
      { status: 403 }
    );
  }
  const supabase = await createAdminClient({ noCookie: true });

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  const page = Math.max(
    Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1,
    1
  );
  const pageSize = Math.min(
    Math.max(
      Number.parseInt(
        url.searchParams.get('pageSize') ?? `${DEFAULT_PAGE_SIZE}`,
        10
      ) || DEFAULT_PAGE_SIZE,
      1
    ),
    MAX_PAGE_SIZE
  );

  const queryBuilder = supabase
    .from('workspace_user_group_tags')
    .select('*, group_ids:workspace_user_group_tag_groups(group_id)', {
      count: 'exact',
    })
    .eq('ws_id', id)
    .order('created_at', { ascending: false });

  if ((q?.length ?? 0) > 0) {
    queryBuilder.ilike('name', `%${q}%`);
  }

  const from = (page - 1) * pageSize;
  queryBuilder.range(from, from + pageSize - 1);

  const { data, error, count } = await queryBuilder;

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace user group tags' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: (data ?? []).map(({ group_ids, ...tag }) => ({
      ...tag,
      group_ids: (group_ids ?? []).map(
        (group: { group_id: string }) => group.group_id
      ),
    })),
    count: count ?? 0,
    page,
    pageSize,
  });
}

export async function POST(req: Request, { params }: Params) {
  const parsedParams = ParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid route params' },
      { status: 400 }
    );
  }
  const { wsId: id } = parsedParams.data;
  const permissions = await getUserGroupRoutePermissions(id, req);
  if (!permissions) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  if (permissions.withoutPermission('create_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create user group tags' },
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

  const parsed = CreateGroupTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { group_ids, ...coreData } = parsed.data;
  const supabase = await createAdminClient({ noCookie: true });

  const { data: groups, error: groupsError } = await loadWorkspaceUserGroups(
    supabase,
    id,
    group_ids
  );
  if (groupsError) {
    console.error('Error validating workspace user groups for tag');
    return NextResponse.json(
      { message: 'Error creating workspace user group tag' },
      { status: 500 }
    );
  }

  if ((groups?.length ?? 0) !== group_ids.length) {
    return NextResponse.json(
      { message: 'One or more user groups were not found' },
      { status: 404 }
    );
  }

  const { data: tag, error: tagError } = await supabase
    .from('workspace_user_group_tags')
    .insert({
      ...coreData,
      ws_id: id,
    })
    .select('id')
    .single();

  if (tagError) {
    console.error('Error creating workspace user group tag');
    return NextResponse.json(
      { message: 'Error creating workspace user group tag' },
      { status: 500 }
    );
  }

  const { error: groupError } =
    group_ids && group_ids.length > 0
      ? await supabase.from('workspace_user_group_tag_groups').insert(
          group_ids.map((group_id) => ({
            tag_id: tag.id,
            group_id,
          }))
        )
      : { error: null };

  if (groupError) {
    console.error('Error creating workspace user group tag groups');
    return NextResponse.json(
      { message: 'Error creating workspace user group tag groups' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
