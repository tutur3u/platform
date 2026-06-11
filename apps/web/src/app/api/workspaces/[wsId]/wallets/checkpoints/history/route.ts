import { GET as handleWalletCheckpointHistoryGET } from '@tuturuuu/apis/finance/wallets/checkpoints/history/route';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

type Params = { params: Promise<{ wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleWalletCheckpointHistoryGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
