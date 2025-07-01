import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceRole } from '@tuturuuu/types/db';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  const data = (await req.json()) as WorkspaceRole;

  if (!data?.permissions)
    return NextResponse.json(
      { message: 'No permissions provided' },
      { status: 400 }
    );

  const { permissions } = data;

  const { error } = await supabase.from('workspace_default_permissions').upsert(
    permissions.map((permission) => ({
      ws_id: wsId,
      permission: permission.id,
      enabled: permission.enabled,
    }))
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
