import {
  DELETE as handleWalletDELETE,
  GET as handleWalletGET,
  PUT as handleWalletPUT,
} from '@tuturuuu/apis/finance/wallets/walletId/route';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

type Params = { params: Promise<{ walletId: string; wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleWalletGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function PUT(request: Request, context: Params) {
  return handleWalletPUT(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function DELETE(request: Request, context: Params) {
  return handleWalletDELETE(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
