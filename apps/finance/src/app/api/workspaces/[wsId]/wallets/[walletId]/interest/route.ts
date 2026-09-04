import {
  GET as handleInterestGET,
  POST as handleInterestPOST,
} from '@tuturuuu/apis/finance/wallets/walletId/interest/route';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';

type Params = { params: Promise<{ walletId: string; wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleInterestGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function POST(request: Request, context: Params) {
  return handleInterestPOST(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
