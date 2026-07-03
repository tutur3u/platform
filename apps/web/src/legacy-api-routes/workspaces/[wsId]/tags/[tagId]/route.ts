import {
  DELETE as handleTagDELETE,
  GET as handleTagGET,
  PUT as handleTagPUT,
} from '@tuturuuu/apis/finance/tags/tagId/route';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

type Params = { params: Promise<{ tagId: string; wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleTagGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function PUT(request: Request, context: Params) {
  return handleTagPUT(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function DELETE(request: Request, context: Params) {
  return handleTagDELETE(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
