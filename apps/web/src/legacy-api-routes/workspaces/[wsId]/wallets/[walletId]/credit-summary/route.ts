import { GET as handleWalletCreditSummaryGET } from '@tuturuuu/apis/finance/wallets/walletId/credit-summary/route';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

type Params = { params: Promise<{ walletId: string; wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleWalletCreditSummaryGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
