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
  const daysAhead = Number.parseInt(
    url.searchParams.get('daysAhead') ?? '30',
    10
  );

  const permissions = await getPermissions({ wsId, request });
  if (!permissions || permissions.withoutPermission('view_transactions')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { data, error } = await supabase.rpc(
    'get_upcoming_recurring_transactions',
    {
      _ws_id: wsId,
      days_ahead: Number.isNaN(daysAhead) ? 30 : daysAhead,
    }
  );

  if (error) {
    console.error('Error fetching upcoming recurring transactions:', error);
    return NextResponse.json(
      { message: 'Failed to fetch upcoming recurring transactions' },
      { status: 500 }
    );
  }

  return NextResponse.json({ upcomingTransactions: data ?? [] });
}
