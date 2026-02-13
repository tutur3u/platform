import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    groupId: string;
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { groupId, wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user groups' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from('workspace_user_groups_users')
    .select('*', {
      count: 'exact',
    })
    .eq('group_id', groupId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching group members' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { groupId, wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { withoutPermission } = permissions;
  if (withoutPermission('update_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update user groups' },
      { status: 403 }
    );
  }

  const data = (await req.json()) as {
    memberIds: string[];
  };

  if (!data?.memberIds)
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });

  const { error: groupError } = await supabase
    .from('workspace_user_groups_users')
    .insert(
      data.memberIds.map((memberId) => ({
        user_id: memberId,
        group_id: groupId,
      }))
    );

  if (groupError) {
    console.log(groupError);
    return NextResponse.json(
      { message: 'Error adding new members to group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
