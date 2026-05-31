import type { Database } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import {
  type FinanceRouteAuthContext,
  getFinanceRouteContext,
} from '../../request-access';

interface Params {
  params: Promise<{
    wsId: string;
    debtId: string;
  }>;
}

type DebtLoanDetail =
  Database['private']['Tables']['workspace_debt_loans']['Row'] & {
    progress_percentage: number;
    remaining_balance: number;
  };

type DebtLoanUpdate =
  Database['private']['Tables']['workspace_debt_loans']['Update'];

type PrivateDebtLoanRpcClient = {
  rpc: (
    fn: 'get_debt_loan_with_balance',
    args: {
      _actor_id: string;
      _debt_id: string;
      _ws_id: string;
    }
  ) => Promise<{
    data: DebtLoanDetail[] | null;
    error: { message?: string } | null;
  }>;
};

export async function GET(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId, debtId } = await params;
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

  const privateRpc = sbAdmin.schema(
    'private'
  ) as unknown as PrivateDebtLoanRpcClient;
  const { data, error } = await privateRpc.rpc('get_debt_loan_with_balance', {
    _actor_id: user.id,
    _debt_id: debtId,
    _ws_id: normalizedWsId,
  });

  if (error) {
    console.error('Error fetching debt/loan:', error);
    return NextResponse.json(
      { message: 'Error fetching debt/loan' },
      { status: 500 }
    );
  }

  const debt = data?.[0];

  if (!debt) {
    return NextResponse.json(
      { message: 'Debt/loan not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(debt);
}

export async function PUT(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId, debtId } = await params;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin } = access.context;
  const { withoutPermission } = permissions;

  if (withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const body = await req.json();

  // Build the update data - only include fields that are provided
  const updateData: DebtLoanUpdate = {};

  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.counterparty !== undefined)
    updateData.counterparty = body.counterparty;
  if (body.principal_amount !== undefined) {
    if (body.principal_amount <= 0) {
      return NextResponse.json(
        { message: 'Principal amount must be positive' },
        { status: 400 }
      );
    }
    updateData.principal_amount = body.principal_amount;
  }
  if (body.currency !== undefined) updateData.currency = body.currency;
  if (body.interest_rate !== undefined)
    updateData.interest_rate = body.interest_rate;
  if (body.interest_type !== undefined)
    updateData.interest_type = body.interest_type;
  if (body.start_date !== undefined) updateData.start_date = body.start_date;
  if (body.due_date !== undefined) updateData.due_date = body.due_date;
  if (body.status !== undefined) {
    if (!['active', 'paid', 'defaulted', 'cancelled'].includes(body.status)) {
      return NextResponse.json(
        {
          message:
            'Invalid status: must be "active", "paid", "defaulted", or "cancelled"',
        },
        { status: 400 }
      );
    }
    updateData.status = body.status;
  }
  if (body.wallet_id !== undefined) updateData.wallet_id = body.wallet_id;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { message: 'No fields to update' },
      { status: 400 }
    );
  }

  const { data, error } = await sbAdmin
    .schema('private')
    .from('workspace_debt_loans')
    .update(updateData)
    .eq('id', debtId)
    .eq('ws_id', normalizedWsId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { message: 'Debt/loan not found' },
        { status: 404 }
      );
    }
    console.error('Error updating debt/loan:', error);
    return NextResponse.json(
      { message: 'Error updating debt/loan' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId, debtId } = await params;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin } = access.context;
  const { withoutPermission } = permissions;

  if (withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { error } = await sbAdmin
    .schema('private')
    .from('workspace_debt_loans')
    .delete()
    .eq('id', debtId)
    .eq('ws_id', normalizedWsId);

  if (error) {
    console.error('Error deleting debt/loan:', error);
    return NextResponse.json(
      { message: 'Error deleting debt/loan' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Deleted successfully' });
}
