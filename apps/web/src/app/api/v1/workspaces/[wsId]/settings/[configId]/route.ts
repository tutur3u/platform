import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { getWorkspaceConfig } from '@/lib/workspace-helper';

interface Params {
  params: Promise<{
    wsId: string;
    configId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId: rawWsId, configId: id } = await params;
  const supabase = await createClient(req);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Normalize workspace ID to UUID (handles 'personal', 'internal', etc.)
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const { data: memberCheck, error: memberError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError) {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!memberCheck) {
    return NextResponse.json(
      { message: 'Workspace access denied' },
      { status: 403 }
    );
  }

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { withoutPermission } = permissions;
  if (withoutPermission('manage_workspace_settings')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to modify workspace settings' },
      { status: 403 }
    );
  }

  const { value } = await req.json();

  const { error } = await supabase
    .from('workspace_configs')
    .upsert({
      id,
      ws_id: wsId,
      value: value ?? '',
      updated_at: new Date().toISOString(),
    })
    .eq('ws_id', wsId)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error upserting workspace config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function GET(_: Request, { params }: Params) {
  const { wsId: rawWsId, configId: id } = await params;

  // Normalize workspace ID to UUID (handles 'personal', 'internal', etc.)
  const wsId = await normalizeWorkspaceId(rawWsId);
  const value = await getWorkspaceConfig(wsId, id);

  if (value === null) {
    return NextResponse.json({}, { status: 404 });
  }

  return NextResponse.json({ value });
}
