import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database, TablesInsert, WorkspaceRole } from '@tuturuuu/types';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { normalizeRoleMembers } from '@/lib/workspace-role-members';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

type WorkspaceRolePermissionValue =
  Database['public']['Enums']['workspace_role_permission'];

async function authorizeRolesRequest(req: Request, wsId: string) {
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
  const authorization = await authorizeRolesRequest(req, wsId);
  if (authorization.error) return authorization.error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? undefined;
  const page = Number.parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = Number.parseInt(searchParams.get('pageSize') ?? '10', 10);
  const normalizedPage = Number.isFinite(page) && page > 0 ? page : 1;
  const normalizedPageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 10;
  const start = (normalizedPage - 1) * normalizedPageSize;
  const end = start + normalizedPageSize - 1;
  const resolvedWsId = authorization.permissions.wsId;
  const supabase = await createAdminClient();

  const rolesQuery = supabase
    .from('workspace_roles')
    .select(
      'id, name, ws_id, permissions:workspace_role_permissions(id:permission, enabled), workspace_role_members(user_id, users:user_id(id, display_name, avatar_url, user_private_details(email))), created_at',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', resolvedWsId)
    .order('created_at', { ascending: false })
    .range(start, end);

  if (q) rolesQuery.ilike('name', `%${q}%`);

  const { data, error, count } = await rolesQuery;

  if (error) {
    console.error('Error fetching workspace roles', {
      error,
      wsId: resolvedWsId,
    });
    return NextResponse.json(
      { message: 'Error fetching workspace roles' },
      { status: 500 }
    );
  }

  const roles = (data ?? []).map(
    ({ workspace_role_members, ...role }) =>
      ({
        ...role,
        members: normalizeRoleMembers(workspace_role_members as any[]),
        user_count: workspace_role_members?.length ?? 0,
      }) satisfies WorkspaceRole
  );

  return NextResponse.json({ data: roles, count: count ?? 0 });
}

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;
  const authorization = await authorizeRolesRequest(req, wsId);
  if (authorization.error) return authorization.error;

  const supabase = await createAdminClient();
  const resolvedWsId = authorization.permissions.wsId;

  const data = (await req.json()) as WorkspaceRole;

  if (!data?.permissions)
    return NextResponse.json(
      { message: 'No permissions provided' },
      { status: 400 }
    );

  const { permissions } = data;
  const coreData: TablesInsert<'workspace_roles'> = {
    name: data.name,
    ws_id: resolvedWsId,
  };

  const { data: role, error: roleError } = await supabase
    .from('workspace_roles')
    .insert(coreData)
    .select('id')
    .single();

  if (roleError) {
    console.error('Error creating workspace role', {
      error: roleError,
      wsId: resolvedWsId,
    });
    return NextResponse.json(
      { message: 'Error creating workspace role' },
      { status: 500 }
    );
  }

  const { error: permissionsError } = await supabase
    .from('workspace_role_permissions')
    .insert(
      permissions.map(
        (permission): TablesInsert<'workspace_role_permissions'> => ({
          ws_id: resolvedWsId,
          role_id: role.id,
          permission: permission.id as WorkspaceRolePermissionValue,
          enabled: permission.enabled,
        })
      )
    );

  if (permissionsError) {
    const { error: roleError } = await supabase
      .from('workspace_roles')
      .delete()
      .eq('id', role.id);

    if (roleError) {
      console.error('Error rolling back workspace role creation', {
        error: roleError,
        roleId: role.id,
        wsId: resolvedWsId,
      });
      return NextResponse.json(
        { message: 'Error creating workspace role and permissions' },
        { status: 500 }
      );
    }

    console.error('Error creating workspace role permissions', {
      error: permissionsError,
      roleId: role.id,
      wsId: resolvedWsId,
    });
    return NextResponse.json(
      { message: 'Error creating workspace role permissions' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
