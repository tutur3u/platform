import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import { NextResponse } from 'next/server';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  listWorkspaceDefaultIncludedGroupIds,
  replaceWorkspaceDefaultIncludedGroupIds,
} from '@/lib/workspace-default-included-groups';
import { getWorkspaceConfig } from '@/lib/workspace-helper';

interface Params {
  params: Promise<{
    wsId: string;
    configId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId: rawWsId, configId: id } = await params;
  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, permissions, sbAdmin } = access.context;

  const { withoutPermission } = permissions;
  if (withoutPermission('manage_workspace_settings')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to modify workspace settings' },
      { status: 403 }
    );
  }

  if (
    id === 'default_wallet_id' &&
    withoutPermission('change_finance_wallets')
  ) {
    return NextResponse.json(
      { message: 'Insufficient permissions to change the default wallet' },
      { status: 403 }
    );
  }

  const { value } = await req.json();
  if (value !== undefined && value !== null && typeof value !== 'string') {
    return NextResponse.json(
      { message: 'Invalid workspace config value' },
      { status: 400 }
    );
  }

  if (id === DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID) {
    const { errorMessage } = await replaceWorkspaceDefaultIncludedGroupIds(
      sbAdmin,
      wsId,
      value
    );

    if (errorMessage) {
      return NextResponse.json({ message: errorMessage }, { status: 500 });
    }

    return NextResponse.json({ message: 'success' });
  }

  const { error } = await sbAdmin
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
    serverLogger.error('Error upserting workspace config:', error);
    return NextResponse.json(
      {
        message:
          error.message || error.details || 'Error upserting workspace config',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: rawWsId, configId: id } = await params;
  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req)
  );

  if (access.response) {
    return NextResponse.json({}, { status: access.response.status });
  }

  const { normalizedWsId: wsId, sbAdmin } = access.context;

  if (id === DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID) {
    const { data, errorMessage } = await listWorkspaceDefaultIncludedGroupIds(
      sbAdmin,
      wsId
    );

    if (errorMessage) {
      return NextResponse.json({ message: errorMessage }, { status: 500 });
    }

    return NextResponse.json({
      value: data.length > 0 ? data.join(',') : null,
    });
  }

  const value = await getWorkspaceConfig(wsId, id);

  if (value === null) {
    return NextResponse.json({}, { status: 404 });
  }

  return NextResponse.json({ value });
}
