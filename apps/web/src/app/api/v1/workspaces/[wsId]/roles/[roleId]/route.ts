import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  Database,
  TablesInsert,
  TablesUpdate,
  WorkspaceRole,
} from '@tuturuuu/types';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    roleId: string;
  }>;
}

type WorkspaceRolePermissionValue =
  Database['public']['Enums']['workspace_role_permission'];

export async function GET(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { roleId: id } = await params;

  const { data, error } = await supabase
    .from('workspace_roles')
    .select(
      'id, name, permissions:workspace_role_permissions(id:permission, enabled), created_at'
    )
    .eq('id', id)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace role' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { wsId, roleId: id } = await params;

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
    .eq('id', id);

  const permissionsQuery = supabase.from('workspace_role_permissions').upsert(
    permissions.map(
      (permission): TablesInsert<'workspace_role_permissions'> => ({
        ws_id: wsId,
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
    console.log(roleRes.error, permissionsRes.error);
    return NextResponse.json(
      { message: 'Error updating workspace role' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { roleId: id } = await params;

  const { error } = await supabase
    .from('workspace_roles')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace role' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
