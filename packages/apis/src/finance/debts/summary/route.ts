import { createClient } from '@tuturuuu/supabase/next/server';
import type { DebtLoanSummary } from '@tuturuuu/types/primitives/DebtLoan';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
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

  // Use the RPC function to get summary
  const { data, error } = await supabase.rpc('get_debt_loan_summary', {
    p_ws_id: wsId,
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
