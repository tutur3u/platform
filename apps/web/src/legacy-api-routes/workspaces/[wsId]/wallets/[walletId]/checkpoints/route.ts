import {
  GET as handleWalletCheckpointsGET,
  POST as handleWalletCheckpointsPOST,
} from '@tuturuuu/apis/finance/wallets/walletId/checkpoints/route';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

type Params = { params: Promise<{ walletId: string; wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleWalletCheckpointsGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function POST(request: Request, context: Params) {
  return handleWalletCheckpointsPOST(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
