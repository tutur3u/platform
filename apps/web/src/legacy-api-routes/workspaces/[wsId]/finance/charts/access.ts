import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { NextResponse } from 'next/server';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

export async function requireFinanceStatsAccess(
  request: Request,
  rawWsId: string
) {
  const access = await getFinanceRouteContext(
    request,
    rawWsId,
    await resolveFinanceRouteAuthContext(request)
  );

  if (access.response) {
    return { response: access.response };
  }

  if (access.context.permissions.withoutPermission('view_finance_stats')) {
    return {
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return { context: access.context };
}
