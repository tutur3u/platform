import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type {
  Database,
  TablesInsert,
  WorkspaceDefaultPermissionMemberType,
  WorkspaceDefaultPermissionsRole,
  WorkspaceRole,
} from '@tuturuuu/types';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

type WorkspaceRolePermissionValue =
  Database['public']['Enums']['workspace_role_permission'];

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
  const permissions = await getPermissions({ wsId, request: req });

  if (!permissions || permissions.withoutPermission('manage_workspace_roles')) {
    return {
      error: NextResponse.json(
        { message: 'Workspace role access denied' },
        { status: 403 }
      ),
      permissions: null,
    };
  }

  return { error: null, permissions };
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

  const supabase = await createAdminClient();
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

  const supabase = await createAdminClient();
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

  const { permissions } = data;

  const { error } = await supabase.from('workspace_default_permissions').upsert(
    permissions.map(
      (permission): TablesInsert<'workspace_default_permissions'> => ({
        ws_id: resolvedWsId,
        permission: permission.id as WorkspaceRolePermissionValue,
        member_type: bodyMemberType,
        enabled: permission.enabled,
      })
    ),
    { onConflict: 'ws_id,permission,member_type' }
  );

  if (error) {
    console.error('Error updating default workspace permissions', {
      error,
      memberType: bodyMemberType,
      wsId: resolvedWsId,
    });
    return NextResponse.json(
      { message: 'Error updating default workspace permissions' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
