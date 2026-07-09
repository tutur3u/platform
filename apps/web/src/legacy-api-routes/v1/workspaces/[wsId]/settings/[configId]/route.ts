import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import {
  DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  ENABLE_CMS_GAMES_CONFIG_ID,
} from '@tuturuuu/internal-api/workspace-configs';
import { NextResponse } from 'next/server';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

// Workspace config ids that satellite apps legitimately read/write through their
// own app session. The inventory operator surfaces the workspace default
// currency, so its app session must be accepted for that config alongside the
// finance/platform audiences. Other finance-gated configs stay finance-only.
const INVENTORY_FINANCE_CONFIG_IDS = new Set(['DEFAULT_CURRENCY']);

function financeAuthTargetsForConfig(
  configId: string
): Array<'finance' | 'platform' | 'inventory'> | undefined {
  return INVENTORY_FINANCE_CONFIG_IDS.has(configId)
    ? ['finance', 'platform', 'inventory']
    : undefined;
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId: rawWsId, configId: id } = await params;

  if (id === ENABLE_CMS_GAMES_CONFIG_ID) {
    const access = await requireWorkspaceExternalProjectAccess({
      mode: 'manage',
      request: req,
      wsId: rawWsId,
    });
    if (!access.ok) return access.response;

    const { value } = await req.json();
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return NextResponse.json(
        { message: 'Invalid workspace config value' },
        { status: 400 }
      );
    }

    const { error } = await access.admin
      .from('workspace_configs')
      .upsert({
        id,
        updated_at: new Date().toISOString(),
        value: value ?? '',
        ws_id: access.normalizedWorkspaceId,
      })
      .eq('ws_id', access.normalizedWorkspaceId)
      .eq('id', id);

    if (error) {
      console.error('Error upserting CMS workspace config:', error);
      return NextResponse.json(
        {
          message:
            error.message ||
            error.details ||
            'Error upserting workspace config',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  }

  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req, {
      targetApp: financeAuthTargetsForConfig(id),
    })
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

  const configValue =
    id === 'default_wallet_id' && typeof value === 'string'
      ? value.trim()
      : value;

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

  if (id === 'default_wallet_id' && configValue) {
    if (!UUID_PATTERN.test(configValue)) {
      return NextResponse.json(
        { message: 'Invalid default wallet' },
        { status: 400 }
      );
    }

    const { data: wallet, error: walletError } = await sbAdmin
      .schema('private')
      .from('workspace_wallets')
      .select('id')
      .eq('id', configValue)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (walletError) {
      console.error('Error validating default wallet:', walletError);
      return NextResponse.json(
        { message: 'Failed to validate default wallet' },
        { status: 500 }
      );
    }

    if (!wallet) {
      return NextResponse.json(
        { message: 'Invalid default wallet' },
        { status: 400 }
      );
    }
  }

  const { error } = await sbAdmin
    .from('workspace_configs')
    .upsert({
      id,
      ws_id: wsId,
      value: configValue ?? '',
      updated_at: new Date().toISOString(),
    })
    .eq('ws_id', wsId)
    .eq('id', id);

  if (error) {
    console.error('Error upserting workspace config:', error);
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

  if (id === ENABLE_CMS_GAMES_CONFIG_ID) {
    const access = await requireWorkspaceExternalProjectAccess({
      mode: 'read',
      request: req,
      wsId: rawWsId,
    });
    if (!access.ok) {
      return NextResponse.json({}, { status: access.response.status });
    }

    const value = await getWorkspaceConfig(access.normalizedWorkspaceId, id);

    if (value === null) {
      return NextResponse.json({}, { status: 404 });
    }

    return NextResponse.json({ value });
  }

  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req, {
      targetApp: financeAuthTargetsForConfig(id),
    })
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
