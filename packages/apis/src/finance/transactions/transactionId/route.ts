import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';
interface Params {
  params: Promise<{
    transactionId: string;
    wsId: string;
  }>;
}

const TransactionUpdateSchema = z.object({
  description: z.string().min(1).optional(),
  amount: z.number().optional(),
  origin_wallet_id: z.uuid().optional(),
  category_id: z.uuid().optional(),
  taken_at: z.string().or(z.date()).optional(),
  report_opt_in: z.boolean().optional(),
  tag_ids: z.array(z.uuid()).optional(),
  id: z.uuid().optional(),
});

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { transactionId, wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('view_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: Params) {

  const { transactionId, wsId } = await params;

  const parsed = TransactionUpdateSchema.safeParse(await req.json());
 

  const normalizedId = transactionId;

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('update_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const supabase = await createClient();


  const newData = {
    ...data,
    wallet_id: data.origin_wallet_id,
  };

  delete newData.origin_wallet_id;
  const tagIds = newData.tag_ids;
  delete newData.tag_ids;

// (Optional) Verify new wallet is within wsId if being changed
  if (newData.wallet_id) {
    const { data: walletCheck } = await supabase
      .from('workspace_wallets')
      .select('id')
      .eq('id', newData.wallet_id)
      .eq('ws_id', wsId)
      .single();
    if (!walletCheck) {
      return NextResponse.json({ message: 'Invalid wallet' }, { status: 400 });
    }
  }

  // Build update payload conditionally - only include fields that are provided
  const updatePayload: any = {};

  if (newData.amount !== undefined) {
    updatePayload.amount = newData.amount;
  }
  if (newData.description !== undefined) {
    updatePayload.description = newData.description;
  }
  if (newData.wallet_id !== undefined) {
    updatePayload.wallet_id = newData.wallet_id;
  }
  if (newData.category_id !== undefined) {
    updatePayload.category_id = newData.category_id;
  }
  if (newData.taken_at !== undefined) {
    updatePayload.taken_at =
      typeof newData.taken_at === 'string'
        ? new Date(newData.taken_at).toISOString()
        : (newData.taken_at instanceof Date
            ? newData.taken_at.toISOString()
            : newData.taken_at);
  }
  if (newData.report_opt_in !== undefined) {
    updatePayload.report_opt_in = newData.report_opt_in;
  }

  const { error } = await supabase
    .from('wallet_transactions')
    .update(updatePayload)
    .eq('id', normalizedId);


  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating transaction' },
      { status: 500 }
    );
  }

  // Handle tags if provided
  if (tagIds !== undefined) {
    // First, delete existing tags
    await supabase
      .from('wallet_transaction_tags')
      .delete()
      .eq('transaction_id', transactionId);

    // Then insert new tags if any
    if (tagIds.length > 0) {
      const tagInserts = tagIds.map((tagId: string) => ({
        transaction_id: transactionId,
        tag_id: tagId,
      }));

      const { error: tagError } = await supabase
        .from('wallet_transaction_tags')
        .insert(tagInserts);

      if (tagError) {
        console.log(tagError);
        // Don't fail the entire transaction if tags fail
      }
    }
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { transactionId, wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('delete_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Verify transaction belongs to workspace
  const { data: transaction, error: fetchError } = await supabase
    .from('wallet_transactions')
    .select('wallet_id')
    .eq('id', transactionId)
    .single();

  if (fetchError || !transaction) {
    return NextResponse.json({ message: 'Transaction not found' }, { status: 404 });
  }

  const { data: wallet, error: walletError } = await supabase
    .from('workspace_wallets')
    .select('ws_id')
    .eq('id', transaction.wallet_id)
    .single();

  if (walletError || !wallet || wallet.ws_id !== wsId) {
    return NextResponse.json({ message: 'Transaction not found in workspace' }, { status: 404 });
  }

  const { error } = await supabase
    .from('wallet_transactions')
    .delete()
    .eq('id', transactionId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
