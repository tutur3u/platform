import { createClient } from '@tuturuuu/supabase/next/server';
import type { Database, TablesInsert, WorkspaceRole } from '@tuturuuu/types';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

type WorkspaceRolePermissionValue =
  Database['public']['Enums']['workspace_role_permission'];

export async function GET(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { wsId } = await params;

  const { data, error } = await supabase
    .from('workspace_default_permissions')
    .select('id:permission, enabled')
    .eq('ws_id', wsId)
    .order('permission', { ascending: true });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching default workspace permissions' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: 'DEFAULT',
    name: 'DEFAULT',
    permissions: data ?? [],
  });
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { wsId } = await params;

  const data = (await req.json()) as WorkspaceRole;

  if (!data?.permissions)
    return NextResponse.json(
      { message: 'No permissions provided' },
      { status: 400 }
    );

  const { permissions } = data;

  const { error } = await supabase.from('workspace_default_permissions').upsert(
    permissions.map(
      (permission): TablesInsert<'workspace_default_permissions'> => ({
        ws_id: wsId,
        permission: permission.id as WorkspaceRolePermissionValue,
        enabled: permission.enabled,
      })
    )
  );

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating default workspace permissions' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
