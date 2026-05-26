import { NextResponse } from 'next/server';
import {
  type FinanceRouteAuthContext,
  getFinanceRouteContext,
} from '../../request-access';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId } = await params;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, supabase } = access.context;

  if (permissions.withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase.rpc('get_transaction_count_by_tag', {
    _ws_id: normalizedWsId,
  });

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching tag stats' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
