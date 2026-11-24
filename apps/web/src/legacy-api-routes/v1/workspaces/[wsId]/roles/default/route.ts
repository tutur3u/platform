import { lastManagerResponse } from '@tuturuuu/apis/members/guarded-removal';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type {
  WorkspaceDefaultPermissionMemberType,
  WorkspaceDefaultPermissionsRole,
  WorkspaceRole,
} from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const DEFAULT_MEMBER_TYPES: WorkspaceDefaultPermissionMemberType[] = [
  'MEMBER',
  'GUEST',
];

function parseDefaultMemberType(
  value: string | null
): WorkspaceDefaultPermissionMemberType | null {
  if (!value) return 'MEMBER';
  if (
    DEFAULT_MEMBER_TYPES.includes(value as WorkspaceDefaultPermissionMemberType)
  ) {
    return value as WorkspaceDefaultPermissionMemberType;
  }
  return null;
}

async function authorizeRolesDefaultRequest(req: Request, wsId: string) {
  const access = await resolveWorkspaceRouteAccess(req, wsId, [
    'manage_workspace_roles',
  ]);
  if (!access.ok) {
    return {
      error: access.response,
      permissions: null,
    };
  }

  return {
    error: null,
    permissions: access.permissions,
    userId: access.user?.id,
  };
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;
  const memberType = parseDefaultMemberType(
    new URL(req.url).searchParams.get('memberType')
  );

  if (!memberType) {
    return NextResponse.json(
      { message: 'Invalid memberType. Use MEMBER or GUEST.' },
      { status: 400 }
    );
  }

  const authorization = await authorizeRolesDefaultRequest(req, wsId);
  if (authorization.error) return authorization.error;

  const supabase = await createAdminClient({ noCookie: true });
  const resolvedWsId = authorization.permissions.wsId;

  const { data, error } = await supabase
    .from('workspace_default_permissions')
    .select('id:permission, enabled')
    .eq('ws_id', resolvedWsId)
    .eq('member_type', memberType)
    .order('permission', { ascending: true });

  if (error) {
    console.error('Error fetching default workspace permissions', {
      error,
      memberType,
      wsId: resolvedWsId,
    });
    return NextResponse.json(
      { message: 'Error fetching default workspace permissions' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: 'DEFAULT',
    member_type: memberType,
    name: `${memberType}_DEFAULT`,
    permissions: data ?? [],
  } satisfies WorkspaceDefaultPermissionsRole);
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId } = await params;
  const queryMemberType = parseDefaultMemberType(
    new URL(req.url).searchParams.get('memberType')
  );

  if (!queryMemberType) {
    return NextResponse.json(
      { message: 'Invalid memberType. Use MEMBER or GUEST.' },
      { status: 400 }
    );
  }

  const authorization = await authorizeRolesDefaultRequest(req, wsId);
  if (authorization.error) return authorization.error;

  const supabase = await createAdminClient({ noCookie: true });
  const resolvedWsId = authorization.permissions.wsId;

  const data = (await req.json()) as WorkspaceRole &
    Partial<WorkspaceDefaultPermissionsRole>;
  const bodyMemberType = data.member_type
    ? parseDefaultMemberType(data.member_type)
    : queryMemberType;

  if (!data?.permissions)
    return NextResponse.json(
      { message: 'No permissions provided' },
      { status: 400 }
    );

  if (!bodyMemberType) {
    return NextResponse.json(
      { message: 'Invalid member_type. Use MEMBER or GUEST.' },
      { status: 400 }
    );
  }

  // The guarded function rechecks the actor under the workspace removal lock,
  // drops permissions the actor cannot grant, and rolls the whole edit back
  // when it would leave full members without a member manager.
  const { data: result, error } = await supabase
    .schema('private')
    .rpc('update_workspace_default_permissions_guarded', {
      p_actor_id: authorization.userId,
      p_member_type: bodyMemberType,
      p_mode: 'workspace',
      p_permissions: data.permissions.map((permission) => ({
        enabled: permission.enabled,
        id: permission.id,
      })),
      p_ws_id: resolvedWsId,
    });

  if (!error) {
    switch (result) {
      case 'updated':
        return NextResponse.json({ message: 'success' });
      case 'not_found':
        return NextResponse.json(
          { message: 'Workspace not found' },
          { status: 404 }
        );
      case 'forbidden':
        return NextResponse.json(
          { message: 'Workspace permission denied' },
          { status: 403 }
        );
      case 'last_manager':
        return lastManagerResponse();
    }
  }

  console.error('Error updating default workspace permissions', {
    error,
    memberType: bodyMemberType,
    result,
    wsId: resolvedWsId,
  });
  return NextResponse.json(
    { message: 'Error updating default workspace permissions' },
    { status: 500 }
  );
}
