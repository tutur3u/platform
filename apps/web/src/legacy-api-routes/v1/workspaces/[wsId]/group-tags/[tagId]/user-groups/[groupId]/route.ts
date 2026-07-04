import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    tagId: string;
    groupId: string;
  }>;
}

export async function DELETE(req: Request, { params }: Params) {
  const { groupId, tagId, wsId } = await params;

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sbAdmin = await createAdminClient();

  const { data: tag, error: tagError } = await sbAdmin
    .from('workspace_user_group_tags')
    .select('id')
    .eq('ws_id', wsId)
    .eq('id', tagId)
    .maybeSingle();

  if (tagError) {
    console.error('Error checking workspace user group tag', tagError);
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

  const { data: group, error: groupError } = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();

  if (groupError) {
    console.error('Error checking workspace user group', groupError);
    return NextResponse.json(
      { message: 'Error removing user group' },
      { status: 500 }
    );
  }

  if (!group) {
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
    console.error('Error removing user group from tag', error);
    return NextResponse.json(
      { message: 'Error removing user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
