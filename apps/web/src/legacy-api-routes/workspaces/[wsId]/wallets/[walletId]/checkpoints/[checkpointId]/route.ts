import {
  DELETE as handleWalletCheckpointDELETE,
  PATCH as handleWalletCheckpointPATCH,
} from '@tuturuuu/apis/finance/wallets/walletId/checkpoints/checkpointId/route';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

type Params = {
  params: Promise<{ checkpointId: string; walletId: string; wsId: string }>;
};

export async function PATCH(request: Request, context: Params) {
  return handleWalletCheckpointPATCH(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function DELETE(request: Request, context: Params) {
  return handleWalletCheckpointDELETE(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
