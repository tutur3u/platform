import {
  GET as handleTransactionsGET,
  POST as handleTransactionsPOST,
} from '@tuturuuu/apis/finance/transactions/route';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

type Params = { params: Promise<{ wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleTransactionsGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function POST(request: Request, context: Params) {
  return handleTransactionsPOST(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
