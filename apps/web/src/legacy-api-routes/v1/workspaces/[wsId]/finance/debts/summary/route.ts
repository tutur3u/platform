import { GET as handleDebtSummaryGET } from '@tuturuuu/apis/finance/debts/summary/route';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

type Params = { params: Promise<{ wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleDebtSummaryGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
