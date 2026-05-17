import { GET as handleTransactionExportGET } from '@tuturuuu/apis/finance/transactions/export/route';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

type Params = { params: Promise<{ wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleTransactionExportGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
