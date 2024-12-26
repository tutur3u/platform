import { WorkspaceRole } from '@/types/db';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    roleId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, roleId: id } = await params;

  const data = (await req.json()) as WorkspaceRole;

  if (!data?.permissions)
    return NextResponse.json(
      { message: 'No permissions provided' },
      { status: 400 }
    );

  const { permissions, ...coreData } = data;

  const roleQuery = supabase
    .from('workspace_roles')
    .update(coreData)
    .eq('id', id);

  const permissionsQuery = supabase.from('workspace_role_permissions').upsert(
    permissions.map((permission) => ({
      ws_id: wsId,
      role_id: id,
      permission: permission.id,
      enabled: permission.enabled,
    }))
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

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
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
