import {
  GET as handleRatesGET,
  POST as handleRatesPOST,
} from '@tuturuuu/apis/finance/wallets/walletId/interest/rates/route';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';

type Params = { params: Promise<{ walletId: string; wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleRatesGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function POST(request: Request, context: Params) {
  return handleRatesPOST(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
