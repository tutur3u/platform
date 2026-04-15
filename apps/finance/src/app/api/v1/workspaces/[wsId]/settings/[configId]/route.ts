import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  getWorkspaceConfig,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    configId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { wsId: rawWsId, configId: id } = await params;

  // Normalize workspace ID to UUID (handles 'personal', 'internal', etc.)
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  if (permissions.withoutPermission('manage_workspace_settings')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to modify workspace settings' },
      { status: 403 }
    );
  }

  if (
    id === 'default_wallet_id' &&
    permissions.withoutPermission('change_finance_wallets')
  ) {
    return NextResponse.json(
      { message: 'Insufficient permissions to change the default wallet' },
      { status: 403 }
    );
  }

  const { value } = await req.json();

  const { error } = await supabase
    .from('workspace_configs')
    .upsert({
      id,
      ws_id: wsId,
      value: value || '',
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
