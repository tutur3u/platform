import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { NextResponse } from 'next/server';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: id } = await params;
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'all';
  const access = await getFinanceRouteContext(
    request,
    id,
    await resolveFinanceRouteAuthContext(request)
  );

  if (access.response) {
    return access.response;
  }

  const {
    normalizedWsId: wsId,
    permissions,
    sbAdmin,
    supabase,
  } = access.context;
  if (!permissions || permissions.withoutPermission('view_transactions')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  if (type === 'transaction_creators') {
    const { data, error } = await sbAdmin
      .from('distinct_transaction_creators')
      .select('id, display_name')
      .eq('ws_id', wsId);

    if (error) {
      serverLogger.error('Failed to fetch transaction creators:', error);
      return NextResponse.json(
        { message: 'Failed to fetch transaction creators' },
        { status: 500 }
      );
    }

    return NextResponse.json({ users: data ?? [] });
  }

  if (type === 'invoice_creators') {
    const { data, error } = await sbAdmin
      .from('distinct_invoice_creators')
      .select('id, display_name')
      .eq('ws_id', wsId);

    if (error) {
      serverLogger.error('Failed to fetch invoice creators:', error);
      return NextResponse.json(
        { message: 'Failed to fetch invoice creators' },
        { status: 500 }
      );
    }

    return NextResponse.json({ users: data ?? [] });
  }

  const { data, error } = await supabase
    .from('workspace_users')
    .select('id, full_name, display_name, email, avatar_url')
    .eq('ws_id', wsId)
    .order('full_name', { ascending: true });

  if (error) {
    serverLogger.error('Failed to fetch workspace users:', error);
    return NextResponse.json(
      { message: 'Failed to fetch workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json({ users: data ?? [] });
}
