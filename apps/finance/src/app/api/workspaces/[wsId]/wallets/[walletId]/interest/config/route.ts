import {
  DELETE as handleConfigDELETE,
  PUT as handleConfigPUT,
} from '@tuturuuu/apis/finance/wallets/walletId/interest/config/route';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';

type Params = { params: Promise<{ walletId: string; wsId: string }> };

export async function PUT(request: Request, context: Params) {
  return handleConfigPUT(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function DELETE(request: Request, context: Params) {
  return handleConfigDELETE(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
