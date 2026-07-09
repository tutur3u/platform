import { GET as handleWalletsInfiniteGET } from '@tuturuuu/apis/finance/wallets/infinite/route';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';

type Params = { params: Promise<{ wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleWalletsInfiniteGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
