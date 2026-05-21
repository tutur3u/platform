import {
  GET as handleDebtsGET,
  POST as handleDebtsPOST,
} from '@tuturuuu/apis/finance/debts/route';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

type Params = { params: Promise<{ wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleDebtsGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function POST(request: Request, context: Params) {
  return handleDebtsPOST(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
