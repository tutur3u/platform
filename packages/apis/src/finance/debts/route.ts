import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  DebtLoanStatus,
  DebtLoanType,
  DebtLoanWithBalance,
} from '@tuturuuu/types/primitives/DebtLoan';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;
  const permissions = await getPermissions({ wsId });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Parse query parameters for filtering
  const url = new URL(req.url);
  const typeParam = url.searchParams.get('type') as DebtLoanType | null;
  const statusParam = url.searchParams.get('status') as DebtLoanStatus | null;

  // Use the RPC function to get debts/loans with calculated fields
  const { data, error } = await supabase.rpc('get_debt_loans_with_balance', {
    p_ws_id: wsId,
    p_type: typeParam ?? undefined,
    p_status: statusParam ?? undefined,
  });

  if (error) {
    console.error('Error fetching debt/loans:', error);
    return NextResponse.json(
      { message: 'Error fetching debt/loans' },
      { status: 500 }
    );
  }

  return NextResponse.json(data as DebtLoanWithBalance[]);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;
  const permissions = await getPermissions({ wsId });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const body = await req.json();

  // Validate required fields
  if (!body.name || !body.type || !body.principal_amount) {
    return NextResponse.json(
      { message: 'Missing required fields: name, type, principal_amount' },
      { status: 400 }
    );
  }

  // Validate type
  if (!['debt', 'loan'].includes(body.type)) {
    return NextResponse.json(
      { message: 'Invalid type: must be "debt" or "loan"' },
      { status: 400 }
    );
  }

  // Validate principal amount
  if (body.principal_amount <= 0) {
    return NextResponse.json(
      { message: 'Principal amount must be positive' },
      { status: 400 }
    );
  }

  // Build the insert data
  const { data, error } = await supabase
    .from('workspace_debt_loans')
    .insert({
      ws_id: wsId,
      name: body.name as string,
      type: body.type as 'debt' | 'loan',
      principal_amount: body.principal_amount as number,
      currency: (body.currency as string) || 'VND',
      start_date:
        (body.start_date as string) || new Date().toISOString().split('T')[0],
      status: (body.status || 'active') as
        | 'active'
        | 'paid'
        | 'defaulted'
        | 'cancelled',
      creator_id: user.id,
      description: (body.description as string) || null,
      counterparty: (body.counterparty as string) || null,
      interest_rate:
        body.interest_rate !== undefined
          ? (body.interest_rate as number)
          : null,
      interest_type: body.interest_type
        ? (body.interest_type as 'simple' | 'compound')
        : null,
      due_date: (body.due_date as string) || null,
      wallet_id: (body.wallet_id as string) || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating debt/loan:', error);
    return NextResponse.json(
      { message: 'Error creating debt/loan' },
      { status: 500 }
    );
  }

  return NextResponse.json(data, { status: 201 });
}
