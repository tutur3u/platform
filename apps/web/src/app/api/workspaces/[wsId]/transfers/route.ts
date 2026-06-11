import {
  PATCH as handleTransfersPATCH,
  POST as handleTransfersPOST,
  PUT as handleTransfersPUT,
} from '@tuturuuu/apis/finance/transfers/route';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

type Params = { params: Promise<{ wsId: string }> };

export async function PATCH(request: Request, context: Params) {
  return handleTransfersPATCH(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function POST(request: Request, context: Params) {
  return handleTransfersPOST(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function PUT(request: Request, context: Params) {
  return handleTransfersPUT(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
