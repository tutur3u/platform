import {
  DELETE as handleTransactionCategoryDELETE,
  GET as handleTransactionCategoryGET,
  PUT as handleTransactionCategoryPUT,
} from '@tuturuuu/apis/finance/transactions/categories/categoryId/route';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

type Params = { params: Promise<{ categoryId: string; wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleTransactionCategoryGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function PUT(request: Request, context: Params) {
  return handleTransactionCategoryPUT(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function DELETE(request: Request, context: Params) {
  return handleTransactionCategoryDELETE(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
