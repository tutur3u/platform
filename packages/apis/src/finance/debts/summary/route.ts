import type { DebtLoanSummary } from '@tuturuuu/types/primitives/DebtLoan';
import { NextResponse } from 'next/server';
import {
  type FinanceRouteAuthContext,
  getFinanceRouteContext,
} from '../../request-access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId } = await params;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin, user } = access.context;
  const { withoutPermission } = permissions;

  if (withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Use the RPC function to get summary
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('get_debt_loan_summary', {
      _actor_id: user.id,
      _ws_id: normalizedWsId,
    });

  if (error) {
    console.error('Error fetching debt/loan summary:', error);
    return NextResponse.json(
      { message: 'Error fetching debt/loan summary' },
      { status: 500 }
    );
  }

  // RPC returns an array with a single row
  const summary: DebtLoanSummary = data?.[0] || {
    total_debts: 0,
    total_loans: 0,
    active_debt_count: 0,
    active_loan_count: 0,
    total_debt_remaining: 0,
    total_loan_remaining: 0,
    net_position: 0,
  };

  return NextResponse.json(summary);
}
