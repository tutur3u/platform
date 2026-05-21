import {
  GET as handleTagsGET,
  POST as handleTagsPOST,
} from '@tuturuuu/apis/finance/tags/route';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

type Params = { params: Promise<{ wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleTagsGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function POST(request: Request, context: Params) {
  return handleTagsPOST(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
