import { GET as handleTransactionTagsGET } from '@tuturuuu/apis/finance/transactions/transactionId/tags/route';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';

type Params = { params: Promise<{ transactionId: string; wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleTransactionTagsGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
