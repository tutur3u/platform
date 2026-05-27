import { NextResponse } from 'next/server';
import {
  type FinanceRouteAuthContext,
  getFinanceRouteContext,
} from '../../request-access';
import { getTransactionTagStats } from '../tag-stats-rpc';

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

  const { normalizedWsId, permissions, sbAdmin, user } = access.context;

  if (permissions.withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await getTransactionTagStats(sbAdmin, {
    actorId: user.id,
    wsId: normalizedWsId,
  });

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching tag stats' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
