import { POST as handleWalletCheckpointReconciliationPOST } from '@tuturuuu/apis/finance/wallets/walletId/checkpoints/checkpointId/reconcile/route';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';

type Params = {
  params: Promise<{ checkpointId: string; walletId: string; wsId: string }>;
};

export async function POST(request: Request, context: Params) {
  return handleWalletCheckpointReconciliationPOST(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
