import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const recurringTransactionSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  amount: z.number(),
  wallet_id: z.string().min(1),
  category_id: z.string().nullable().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  start_date: z.string().min(1),
  end_date: z.string().nullable().optional(),
});

interface Params {
  params: Promise<{ wsId: string; recurringTransactionId: string }>;
}

export async function PUT(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const { wsId, recurringTransactionId } = await params;

  const permissions = await getPermissions({ wsId, request });
  if (!permissions || permissions.withoutPermission('manage_finance')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const parsed = recurringTransactionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? 'Invalid request body' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('recurring_transactions')
    .update(parsed.data)
    .eq('ws_id', wsId)
    .eq('id', recurringTransactionId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('Error updating recurring transaction:', error);
    return NextResponse.json(
      { message: 'Failed to update recurring transaction' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Recurring transaction not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const { wsId, recurringTransactionId } = await params;

  const permissions = await getPermissions({ wsId, request });
  if (!permissions || permissions.withoutPermission('manage_finance')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('recurring_transactions')
    .delete()
    .eq('ws_id', wsId)
    .eq('id', recurringTransactionId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error deleting recurring transaction:', error);
    return NextResponse.json(
      { message: 'Failed to delete recurring transaction' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Recurring transaction not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
