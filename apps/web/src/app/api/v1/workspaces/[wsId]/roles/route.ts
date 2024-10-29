import { WorkspaceRole } from '@/types/db';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  const { data, error } = await supabase
    .from('workspace_roles')
    .select('*')
    .eq('ws_id', wsId)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace roles' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  const data = (await req.json()) as WorkspaceRole;

  if (!data?.permissions)
    return NextResponse.json(
      { message: 'No permissions provided' },
      { status: 400 }
    );

  const { permissions, ...coreData } = data;

  const { data: role, error: roleError } = await supabase
    .from('workspace_roles')
    .insert({
      ...coreData,
      ws_id: wsId,
    })
    .select('id')
    .single();

  if (roleError) {
    console.log(roleError);
    return NextResponse.json(
      { message: 'Error creating workspace role' },
      { status: 500 }
    );
  }

  const { error: permissionsError } = await supabase
    .from('workspace_role_permissions')
    .insert(
      permissions.map((permission) => ({
        ws_id: wsId,
        role_id: role.id,
        permission: permission.id,
        enabled: permission.enabled,
      }))
    );

  if (permissionsError) {
    const { error: roleError } = await supabase
      .from('workspace_roles')
      .delete()
      .eq('id', role.id);

    if (roleError) {
      console.log(roleError);
      return NextResponse.json(
        { message: 'Error creating workspace role and permissions' },
        { status: 500 }
      );
    }

    console.log(permissionsError);
    return NextResponse.json(
      { message: 'Error creating workspace role permissions' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
