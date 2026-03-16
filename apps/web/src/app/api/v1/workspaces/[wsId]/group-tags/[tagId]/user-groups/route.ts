import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    tagId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, tagId } = await params;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sbAdmin = await createAdminClient();

  const queryBuilder = sbAdmin
    .from('workspace_user_group_tag_groups')
    .select('...workspace_user_groups!inner(*)', {
      count: 'exact',
    })
    .eq('tag_id', tagId);

  if (q) {
    queryBuilder.ilike('workspace_user_groups.name', `%${q}%`);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching user groups' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: data || [], count: count || 0 });
}

export async function POST(req: Request, { params }: Params) {
  const { wsId, tagId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sbAdmin = await createAdminClient();

  const data = (await req.json()) as {
    groupIds: string[];
  };

  if (!data?.groupIds)
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });

  const { error: tagError } = await sbAdmin
    .from('workspace_user_group_tag_groups')
    .insert(
      data.groupIds.map((groupId) => ({
        group_id: groupId,
        tag_id: tagId,
      }))
    );

  if (tagError) {
    console.log(tagError);
    return NextResponse.json(
      { message: 'Error adding new groups to tag' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
