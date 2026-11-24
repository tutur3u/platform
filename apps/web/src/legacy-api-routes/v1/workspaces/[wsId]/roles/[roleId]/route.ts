import { lastManagerResponse } from '@tuturuuu/apis/members/guarded-removal';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceRole } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

interface Params {
  params: Promise<{
    wsId: string;
    roleId: string;
  }>;
}

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

  return {
    error: null,
    permissions: access.permissions,
    userId: access.user.id,
  };
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

  // The guarded function rechecks the actor under the workspace removal lock,
  // drops permissions the actor cannot grant, and rolls the whole edit back
  // when it would leave full members without a member manager.
  const { data: result, error } = await supabase
    .schema('private')
    .rpc('update_workspace_role_guarded', {
      p_actor_id: authorization.userId,
      p_mode: 'workspace',
      p_name: data.name ?? undefined,
      p_permissions: data.permissions.map((permission) => ({
        enabled: permission.enabled,
        id: permission.id,
      })),
      p_role_id: id,
      p_ws_id: resolvedWsId,
    });

  if (!error) {
    switch (result) {
      case 'updated':
        return NextResponse.json({ message: 'success' });
      case 'not_found':
        return NextResponse.json(
          { message: 'Role not found' },
          { status: 404 }
        );
      case 'forbidden':
        return NextResponse.json(
          { message: 'Workspace permission denied' },
          { status: 403 }
        );
      case 'creator_protected':
        return NextResponse.json(
          { message: 'Only the workspace creator can rename this role' },
          { status: 403 }
        );
      case 'role_protected':
        return NextResponse.json(
          { message: 'This role cannot be renamed' },
          { status: 403 }
        );
      case 'last_manager':
        return lastManagerResponse();
    }
  }

  console.error('Error updating workspace role', {
    error,
    result,
    roleId: id,
    wsId: resolvedWsId,
  });
  return NextResponse.json(
    { message: 'Error updating workspace role' },
    { status: 500 }
  );
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId, roleId: id } = await params;
  const authorization = await authorizeRoleRequest(req, wsId);
  if (authorization.error) return authorization.error;

  const supabase = await createAdminClient({ noCookie: true });
  const resolvedWsId = authorization.permissions.wsId;

  const { data, error } = await supabase.rpc('delete_workspace_role_guarded', {
    p_actor_id: authorization.userId,
    p_mode: 'workspace',
    p_role_id: id,
    p_ws_id: resolvedWsId,
  });

  if (!error) {
    switch (data) {
      case 'removed':
      case 'not_found':
        return NextResponse.json({ message: 'success' });
      case 'forbidden':
        return NextResponse.json(
          { message: 'Workspace permission denied' },
          { status: 403 }
        );
      case 'last_manager':
        return lastManagerResponse();
    }
  }

  console.error('Error deleting workspace role', {
    error,
    result: data,
    roleId: id,
    wsId: resolvedWsId,
  });
  return NextResponse.json(
    { message: 'Error deleting workspace role' },
    { status: 500 }
  );
}
