import { GET as handleTagStatsGET } from '@tuturuuu/apis/finance/tags/stats/route';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';

type Params = { params: Promise<{ wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleTagStatsGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
