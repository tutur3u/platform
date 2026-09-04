import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { NextResponse } from 'next/server';
import {
  GroupTagParamsSchema,
  loadWorkspaceGroupTag,
  loadWorkspaceUserGroups,
  UpdateGroupTagSchema,
} from '../validation';

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
  const { tagId: id, wsId } = parsedParams.data;

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

  const supabase = await createAdminClient({ noCookie: true });

  const { data, error } = await supabase
    .from('workspace_user_group_tags')
    .select('*, group_ids:workspace_user_group_tag_groups(group_id)')
    .eq('ws_id', wsId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching workspace user group tag', error);
    return NextResponse.json(
      { message: 'Error fetching workspace user group tag' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Workspace user group tag not found' },
      { status: 404 }
    );
  }

  const { group_ids: groupIds, ...tag } = data;

  return NextResponse.json({
    data: {
      ...tag,
      group_ids: (groupIds ?? []).map(
        (group: { group_id: string }) => group.group_id
      ),
    },
  });
}

export async function PUT(req: Request, { params }: Params) {
  const parsedParams = GroupTagParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid route params' },
      { status: 400 }
    );
  }
  const { tagId: id, wsId } = parsedParams.data;

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

  const parsed = UpdateGroupTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  if (parsed.data.id && parsed.data.id !== id) {
    return NextResponse.json(
      { message: 'Tag ID does not match route' },
      { status: 400 }
    );
  }

  const { group_ids = [], id: _, ...coreData } = parsed.data;
  const supabase = await createAdminClient({ noCookie: true });

  const { data: tag, error: tagLookupError } = await loadWorkspaceGroupTag(
    supabase,
    wsId,
    id
  );
  if (tagLookupError) {
    console.error('Error checking workspace user group tag');
    return NextResponse.json(
      { message: 'Error updating workspace user group tag' },
      { status: 500 }
    );
  }
  if (!tag) {
    return NextResponse.json(
      { message: 'Workspace user group tag not found' },
      { status: 404 }
    );
  }

  const { data: groups, error: groupsError } = await loadWorkspaceUserGroups(
    supabase,
    wsId,
    group_ids
  );
  if (groupsError) {
    console.error('Error validating workspace user groups for tag');
    return NextResponse.json(
      { message: 'Error updating workspace user group tag' },
      { status: 500 }
    );
  }
  if ((groups?.length ?? 0) !== group_ids.length) {
    return NextResponse.json(
      { message: 'One or more user groups were not found' },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from('workspace_user_group_tags')
    .update(coreData)
    .eq('id', id)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error updating workspace user group tag', error);
    return NextResponse.json(
      { message: 'Error updating workspace user group tag' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Workspace user group tag not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const parsedParams = GroupTagParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid route params' },
      { status: 400 }
    );
  }
  const { tagId: id, wsId } = parsedParams.data;

  const permissions = await getUserGroupRoutePermissions(wsId, req);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (permissions.withoutPermission('delete_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete user group tags' },
      { status: 403 }
    );
  }

  const supabase = await createAdminClient({ noCookie: true });

  const { data: tag, error: tagLookupError } = await loadWorkspaceGroupTag(
    supabase,
    wsId,
    id
  );
  if (tagLookupError) {
    console.error('Error checking workspace user group tag');
    return NextResponse.json(
      { message: 'Error deleting workspace user group tag' },
      { status: 500 }
    );
  }
  if (!tag) {
    return NextResponse.json(
      { message: 'Workspace user group tag not found' },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from('workspace_user_group_tags')
    .delete()
    .eq('id', id)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error deleting workspace user group tag', error);
    return NextResponse.json(
      { message: 'Error deleting workspace user group tag' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Workspace user group tag not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
