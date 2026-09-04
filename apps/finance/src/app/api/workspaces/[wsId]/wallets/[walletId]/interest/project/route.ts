import { GET as handleProjectGET } from '@tuturuuu/apis/finance/wallets/walletId/interest/project/route';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';

type Params = { params: Promise<{ walletId: string; wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleProjectGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
