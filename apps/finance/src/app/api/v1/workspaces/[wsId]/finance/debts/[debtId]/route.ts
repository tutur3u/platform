import {
  DELETE as handleDebtDELETE,
  GET as handleDebtGET,
  PUT as handleDebtPUT,
} from '@tuturuuu/apis/finance/debts/[debtId]/route';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';

type Params = { params: Promise<{ debtId: string; wsId: string }> };

export async function GET(request: Request, context: Params) {
  return handleDebtGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function PUT(request: Request, context: Params) {
  return handleDebtPUT(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function DELETE(request: Request, context: Params) {
  return handleDebtDELETE(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}
