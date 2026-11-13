import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { normalizeCreator } from '@tuturuuu/utils/finance/transform-invoice-results';
import { NextResponse } from 'next/server';

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
      console.error('Failed to fetch transaction creators:', error);
      return NextResponse.json(
        { message: 'Failed to fetch transaction creators' },
        { status: 500 }
      );
    }

    return NextResponse.json({ users: data ?? [] });
  }

  if (type === 'invoice_creators') {
    if (permissions.withoutPermission('view_invoices')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    // Read the same creator relations as the invoice table. Keep legacy IDs for
    // existing userIds URLs; platform-only invoices use their platform ID.
    const users = new Map<
      string,
      { id: string; display_name: string | null }
    >();
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await sbAdmin
        .from('finance_invoices')
        .select(
          'creator_id, platform_creator_id, legacy_creator:workspace_users!creator_id(id, full_name, display_name, email, avatar_url), platform_creator:users!platform_creator_id(id, display_name, avatar_url, user_private_details(full_name, email))'
        )
        .eq('ws_id', wsId)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('Failed to fetch invoice creators:', error);
        return NextResponse.json(
          { message: 'Failed to fetch invoice creators' },
          { status: 500 }
        );
      }

      for (const invoice of data ?? []) {
        const id = invoice.creator_id ?? invoice.platform_creator_id;
        if (!id || users.has(id)) continue;
        const creator = normalizeCreator(
          invoice.platform_creator,
          invoice.legacy_creator
        );
        users.set(id, {
          id,
          display_name:
            creator?.display_name ||
            creator?.full_name ||
            creator?.email ||
            null,
        });
      }
      if (!data || data.length < pageSize) break;
    }

    return NextResponse.json({ users: [...users.values()] });
  }

  const { data, error } = await supabase
    .from('workspace_users')
    .select('id, full_name, display_name, email, avatar_url')
    .eq('ws_id', wsId)
    .order('full_name', { ascending: true });

  if (error) {
    console.error('Failed to fetch workspace users:', error);
    return NextResponse.json(
      { message: 'Failed to fetch workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json({ users: data ?? [] });
}
