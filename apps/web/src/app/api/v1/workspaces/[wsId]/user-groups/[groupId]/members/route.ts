import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    groupId: string;
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { groupId, wsId } = await params;
  const { searchParams } = new URL(req.url);
  const offset = Number.parseInt(searchParams.get('offset') ?? '0', 10);
  const limit = Number.parseInt(searchParams.get('limit') ?? '10', 10);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
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
  const canViewPersonalInfo = permissions.containsPermission(
    'view_users_private_info'
  );
  const canViewPublicInfo = permissions.containsPermission(
    'view_users_public_info'
  );

  const sbAdmin = await createAdminClient();
  const baseFields =
    'id, display_name, full_name, avatar_url, archived, archived_until, note';
  const publicFields = canViewPublicInfo ? ', birthday, gender' : '';
  const personalFields = canViewPersonalInfo ? ', email, phone' : '';
  const selectQuery = `workspace_users(${baseFields}${publicFields}${personalFields}), role`;

  const { data, error } = await sbAdmin
    .from('workspace_user_groups_users')
    .select(selectQuery, {
      count: 'exact',
    })
    .eq('group_id', groupId)
    .range(offset, offset + limit - 1);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching group members' },
      { status: 500 }
    );
  }

  const members = await Promise.all(
    (data ?? []).map(async (user) => {
      const typedUser = user as unknown as {
        workspace_users: Record<string, unknown> & { id: string };
        role: string | null;
      };
      const { data: isGuest } = await sbAdmin.rpc('is_user_guest', {
        user_uuid: typedUser.workspace_users.id,
      });

      return {
        ...typedUser.workspace_users,
        role: typedUser.role,
        isGuest: isGuest ?? false,
      };
    })
  );

  return NextResponse.json({
    data: members,
    count: data?.length ?? 0,
    next: (data?.length ?? 0) < limit ? undefined : offset + limit,
  });
}

export async function POST(req: Request, { params }: Params) {
  const { groupId, wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
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
    role?: 'STUDENT' | 'TEACHER';
  };

  if (!data?.memberIds)
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });

  const sbAdmin = await createAdminClient();

  const { error: groupError } = await sbAdmin
    .from('workspace_user_groups_users')
    .upsert(
      data.memberIds.map((memberId) => ({
        user_id: memberId,
        group_id: groupId,
        role: data.role ?? 'STUDENT',
      })),
      { onConflict: 'group_id,user_id' }
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
