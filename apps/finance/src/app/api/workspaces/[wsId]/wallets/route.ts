import {
  GET as handleWalletsGET,
  POST as handleWalletsPOST,
} from '@tuturuuu/apis/finance/wallets/route';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';

type Params = { params: Promise<{ wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleWalletsGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function POST(request: Request, context: Params) {
  return handleWalletsPOST(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
