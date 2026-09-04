import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { NextResponse } from 'next/server';
import {
  GroupTagGroupParamsSchema,
  loadWorkspaceGroupTag,
  loadWorkspaceUserGroups,
} from '../../../validation';

interface Params {
  params: Promise<{
    wsId: string;
    tagId: string;
    groupId: string;
  }>;
}

export async function DELETE(req: Request, { params }: Params) {
  const parsedParams = GroupTagGroupParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid route params' },
      { status: 400 }
    );
  }
  const { groupId, tagId, wsId } = parsedParams.data;

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

  const sbAdmin = await createAdminClient({ noCookie: true });

  const { data: tag, error: tagError } = await loadWorkspaceGroupTag(
    sbAdmin,
    wsId,
    tagId
  );

  if (tagError) {
    console.error('Error checking workspace user group tag');
    return NextResponse.json(
      { message: 'Error removing user group' },
      { status: 500 }
    );
  }

  if (!tag) {
    return NextResponse.json(
      { message: 'Workspace user group tag not found' },
      { status: 404 }
    );
  }

  const { data: groups, error: groupError } = await loadWorkspaceUserGroups(
    sbAdmin,
    wsId,
    [groupId]
  );

  if (groupError) {
    console.error('Error checking workspace user group');
    return NextResponse.json(
      { message: 'Error removing user group' },
      { status: 500 }
    );
  }

  if (groups?.length !== 1) {
    return NextResponse.json(
      { message: 'Workspace user group not found' },
      { status: 404 }
    );
  }

  const { error } = await sbAdmin
    .from('workspace_user_group_tag_groups')
    .delete()
    .eq('tag_id', tagId)
    .eq('group_id', groupId);

  if (error) {
    console.error('Error removing user group from tag');
    return NextResponse.json(
      { message: 'Error removing user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
