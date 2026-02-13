import { createClient } from '@tuturuuu/supabase/next/server';
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

  const { data, error } = await supabase
    .from('workspace_debt_loans')
    .select('*')
    .eq('id', debtId)
    .eq('ws_id', wsId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { message: 'Debt/loan not found' },
        { status: 404 }
      );
    }
    console.error('Error fetching debt/loan:', error);
    return NextResponse.json(
      { message: 'Error fetching debt/loan' },
      { status: 500 }
    );
  }

  // Calculate remaining balance
  const remaining_balance = data.principal_amount - data.total_paid;
  const progress_percentage =
    data.principal_amount === 0
      ? 100
      : Math.round((data.total_paid / data.principal_amount) * 10000) / 100;

  return NextResponse.json({
    ...data,
    remaining_balance,
    progress_percentage,
  });
}

export async function PUT(req: Request, { params }: Params) {
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

  // Build the update data - only include fields that are provided
  const updateData: Record<string, unknown> = {};

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

  const { data, error } = await supabase
    .from('workspace_debt_loans')
    .update(updateData)
    .eq('id', debtId)
    .eq('ws_id', wsId)
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

export async function DELETE(_: Request, { params }: Params) {
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

  const { error } = await supabase
    .from('workspace_debt_loans')
    .delete()
    .eq('id', debtId)
    .eq('ws_id', wsId);

  if (error) {
    console.error('Error deleting debt/loan:', error);
    return NextResponse.json(
      { message: 'Error deleting debt/loan' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Deleted successfully' });
}
