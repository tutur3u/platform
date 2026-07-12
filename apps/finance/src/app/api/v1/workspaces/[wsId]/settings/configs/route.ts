import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { NextResponse } from 'next/server';

const INVOICE_CREATION_DEFAULT_CONFIG_IDS = new Set([
  'default_wallet_id',
  'default_category_id',
  'DEFAULT_SUBSCRIPTION_CATEGORY_ID',
  'DEFAULT_CURRENCY',
]);

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await getFinanceRouteContext(
    request,
    rawWsId,
    await resolveFinanceRouteAuthContext(request)
  );

  if (access.response) return access.response;

  const { normalizedWsId, permissions, sbAdmin } = access.context;
  const ids = [
    ...new Set(
      (new URL(request.url).searchParams.get('ids') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ];

  if (ids.length === 0) return NextResponse.json({});

  if (
    permissions.withoutPermission('create_invoices') ||
    !ids.every((id) => INVOICE_CREATION_DEFAULT_CONFIG_IDS.has(id))
  ) {
    return NextResponse.json(
      { error: 'Insufficient permissions to read invoice settings' },
      { status: 403 }
    );
  }

  const { data, error } = await sbAdmin
    .from('workspace_configs')
    .select('id, value')
    .eq('ws_id', normalizedWsId)
    .in('id', ids);

  if (error) {
    console.error('Failed to load Finance invoice defaults', {
      error,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { error: 'Failed to fetch workspace configs' },
      { status: 500 }
    );
  }

  const values = new Map<string, string | null>(
    (data ?? []).map((config) => [config.id, config.value])
  );

  return NextResponse.json(
    Object.fromEntries(ids.map((id) => [id, values.get(id) ?? null]))
  );
}
