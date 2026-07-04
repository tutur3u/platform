import {
  GET as handleTransactionCategoriesGET,
  POST as handleTransactionCategoriesPOST,
} from '@tuturuuu/apis/finance/transactions/categories/route';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

type Params = { params: Promise<{ wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleTransactionCategoriesGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function POST(request: Request, context: Params) {
  return handleTransactionCategoriesPOST(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
