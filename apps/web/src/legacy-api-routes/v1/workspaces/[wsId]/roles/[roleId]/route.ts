import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type {
  Database,
  TablesInsert,
  TablesUpdate,
  WorkspaceRole,
} from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

interface Params {
  params: Promise<{
    wsId: string;
    roleId: string;
  }>;
}

type WorkspaceRolePermissionValue =
  Database['public']['Enums']['workspace_role_permission'];

async function authorizeRoleRequest(req: Request, wsId: string) {
  const access = await resolveWorkspaceRouteAccess(req, wsId, [
    'manage_workspace_roles',
  ]);
  if (!access.ok) {
    return {
      error: access.response,
      permissions: null,
    };
  }

  return { error: null, permissions: access.permissions };
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, roleId: id } = await params;
  const authorization = await authorizeRoleRequest(req, wsId);
  if (authorization.error) return authorization.error;

  const supabase = await createAdminClient({ noCookie: true });
  const resolvedWsId = authorization.permissions.wsId;

  const { data, error } = await supabase
    .from('workspace_roles')
    .select(
      'id, name, permissions:workspace_role_permissions(id:permission, enabled), created_at'
    )
    .eq('id', id)
    .eq('ws_id', resolvedWsId)
    .single();

  if (error) {
    console.error('Error fetching workspace role', {
      error,
      roleId: id,
      wsId: resolvedWsId,
    });
    return NextResponse.json(
      { message: 'Error fetching workspace role' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId, roleId: id } = await params;
  const authorization = await authorizeRoleRequest(req, wsId);
  if (authorization.error) return authorization.error;

  const supabase = await createAdminClient({ noCookie: true });
  const resolvedWsId = authorization.permissions.wsId;

  const data = (await req.json()) as WorkspaceRole;

  if (!data?.permissions)
    return NextResponse.json(
      { message: 'No permissions provided' },
      { status: 400 }
    );

  const { permissions } = data;
  const coreData: TablesUpdate<'workspace_roles'> = {
    name: data.name,
  };

  const roleQuery = supabase
    .from('workspace_roles')
    .update(coreData)
    .eq('id', id)
    .eq('ws_id', resolvedWsId);

  const permissionsQuery = supabase.from('workspace_role_permissions').upsert(
    permissions.map(
      (permission): TablesInsert<'workspace_role_permissions'> => ({
        ws_id: resolvedWsId,
        role_id: id,
        permission: permission.id as WorkspaceRolePermissionValue,
        enabled: permission.enabled,
      })
    )
  );

  const [roleRes, permissionsRes] = await Promise.all([
    roleQuery,
    permissionsQuery,
  ]);

  if (roleRes.error || permissionsRes.error) {
    console.error('Error updating workspace role', {
      permissionsError: permissionsRes.error,
      roleError: roleRes.error,
      roleId: id,
      wsId: resolvedWsId,
    });
    return NextResponse.json(
      { message: 'Error updating workspace role' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId, roleId: id } = await params;
  const authorization = await authorizeRoleRequest(req, wsId);
  if (authorization.error) return authorization.error;

  const supabase = await createAdminClient({ noCookie: true });
  const resolvedWsId = authorization.permissions.wsId;

  const { error } = await supabase
    .from('workspace_roles')
    .delete()
    .eq('id', id)
    .eq('ws_id', resolvedWsId);

  if (error) {
    console.error('Error deleting workspace role', {
      error,
      roleId: id,
      wsId: resolvedWsId,
    });
    return NextResponse.json(
      { message: 'Error deleting workspace role' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
