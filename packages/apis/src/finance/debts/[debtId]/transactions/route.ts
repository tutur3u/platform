import { createClient } from '@tuturuuu/supabase/next/server';
import type { DebtLoanTransaction } from '@tuturuuu/types/primitives/DebtLoan';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    debtId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, debtId } = await params;
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

  // Verify the debt/loan belongs to this workspace
  const { data: debtLoan, error: debtLoanError } = await supabase
    .from('workspace_debt_loans')
    .select('id')
    .eq('id', debtId)
    .eq('ws_id', wsId)
    .single();

  if (debtLoanError || !debtLoan) {
    return NextResponse.json(
      { message: 'Debt/loan not found' },
      { status: 404 }
    );
  }

  // Fetch linked transactions with transaction details
  const { data, error } = await supabase
    .from('workspace_debt_loan_transactions')
    .select(
      `
      id,
      debt_loan_id,
      transaction_id,
      amount,
      is_interest,
      note,
      created_at,
      wallet_transactions (
        id,
        amount,
        description,
        taken_at,
        wallet_id,
        category_id
      )
    `
    )
    .eq('debt_loan_id', debtId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching debt/loan transactions:', error);
    return NextResponse.json(
      { message: 'Error fetching debt/loan transactions' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, debtId } = await params;
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
  if (!body.transaction_id || !body.amount) {
    return NextResponse.json(
      { message: 'Missing required fields: transaction_id, amount' },
      { status: 400 }
    );
  }

  if (body.amount <= 0) {
    return NextResponse.json(
      { message: 'Amount must be positive' },
      { status: 400 }
    );
  }

  // Verify the debt/loan belongs to this workspace
  const { data: debtLoan, error: debtLoanError } = await supabase
    .from('workspace_debt_loans')
    .select('id, ws_id')
    .eq('id', debtId)
    .eq('ws_id', wsId)
    .single();

  if (debtLoanError || !debtLoan) {
    return NextResponse.json(
      { message: 'Debt/loan not found' },
      { status: 404 }
    );
  }

  // Verify the transaction belongs to this workspace
  const { data: transaction, error: transactionError } = await supabase
    .from('wallet_transactions')
    .select('id, wallet_id')
    .eq('id', body.transaction_id)
    .single();

  if (transactionError || !transaction) {
    return NextResponse.json(
      { message: 'Transaction not found' },
      { status: 404 }
    );
  }

  // Verify the wallet belongs to this workspace
  const { data: wallet, error: walletError } = await supabase
    .from('workspace_wallets')
    .select('id')
    .eq('id', transaction.wallet_id)
    .eq('ws_id', wsId)
    .single();

  if (walletError || !wallet) {
    return NextResponse.json(
      { message: 'Transaction wallet does not belong to this workspace' },
      { status: 400 }
    );
  }

  // Create the link
  const insertData: Partial<DebtLoanTransaction> & {
    debt_loan_id: string;
    transaction_id: string;
    amount: number;
  } = {
    debt_loan_id: debtId,
    transaction_id: body.transaction_id,
    amount: body.amount,
    is_interest: body.is_interest || false,
  };

  if (body.note) insertData.note = body.note;

  const { data, error } = await supabase
    .from('workspace_debt_loan_transactions')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      // Unique constraint violation
      return NextResponse.json(
        { message: 'Transaction is already linked to this debt/loan' },
        { status: 409 }
      );
    }
    console.error('Error linking transaction:', error);
    return NextResponse.json(
      { message: 'Error linking transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, debtId } = await params;
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

  if (!body.transaction_id) {
    return NextResponse.json(
      { message: 'Missing required field: transaction_id' },
      { status: 400 }
    );
  }

  // Verify the debt/loan belongs to this workspace
  const { data: debtLoan, error: debtLoanError } = await supabase
    .from('workspace_debt_loans')
    .select('id')
    .eq('id', debtId)
    .eq('ws_id', wsId)
    .single();

  if (debtLoanError || !debtLoan) {
    return NextResponse.json(
      { message: 'Debt/loan not found' },
      { status: 404 }
    );
  }

  const { error } = await supabase
    .from('workspace_debt_loan_transactions')
    .delete()
    .eq('debt_loan_id', debtId)
    .eq('transaction_id', body.transaction_id);

  if (error) {
    console.error('Error unlinking transaction:', error);
    return NextResponse.json(
      { message: 'Error unlinking transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Unlinked successfully' });
}
