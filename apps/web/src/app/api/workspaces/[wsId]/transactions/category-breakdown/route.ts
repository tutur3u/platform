import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const { wsId } = await params;
  const url = new URL(request.url);

  const permissions = await getPermissions({ wsId, request });
  if (!permissions || permissions.withoutPermission('view_transactions')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const walletId = url.searchParams.get('walletId');
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const type = url.searchParams.get('type') ?? 'expense';
  const timezone = url.searchParams.get('timezone') ?? 'UTC';

  const { data, error } = await supabase.rpc('get_category_breakdown', {
    _ws_id: wsId,
    _start_date: startDate || undefined,
    _end_date: endDate || undefined,
    include_confidential: true,
    _transaction_type: type,
    _interval: 'daily',
    _anchor_to_latest: false,
    _timezone: timezone,
    _wallet_ids: walletId ? [walletId] : undefined,
  });

  if (error) {
    console.error('Error fetching category breakdown:', error);
    return NextResponse.json(
      { message: 'Failed to fetch category breakdown' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
