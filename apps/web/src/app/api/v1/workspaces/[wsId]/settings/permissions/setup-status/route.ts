import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const { wsId } = await params;

  const permissions = await getPermissions({ wsId, request });
  if (!permissions) {
    return NextResponse.json(
      { message: 'Workspace access denied' },
      { status: 403 }
    );
  }

  const { data: defaultPermissions, error: defaultError } = await supabase
    .from('workspace_default_permissions')
    .select('permission')
    .eq('ws_id', wsId)
    .eq('enabled', true)
    .limit(1);

  if (defaultError) {
    console.error('Error checking default permissions:', defaultError);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }

  if ((defaultPermissions?.length ?? 0) > 0) {
    return NextResponse.json({ hasConfiguredPermissions: true });
  }

  const { data: roles, error: rolesError } = await supabase
    .from('workspace_roles')
    .select('id')
    .eq('ws_id', wsId)
    .limit(1);

  if (rolesError) {
    console.error('Error checking roles:', rolesError);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    hasConfiguredPermissions: (roles?.length ?? 0) > 0,
  });
}
