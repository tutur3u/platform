import { GET as handleCalculateGET } from '@tuturuuu/apis/finance/wallets/walletId/interest/calculate/route';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';

type Params = { params: Promise<{ walletId: string; wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleCalculateGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
