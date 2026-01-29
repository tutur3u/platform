import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Helper function to verify transaction belongs to workspace
async function verifyTransactionWorkspace(transactionId: string, wsId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select(`
      id,
      workspace_wallets!wallet_id (
        ws_id
      )
    `)
    .eq('id', transactionId)
    .eq('workspace_wallets.ws_id', wsId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}
interface Params {
  params: Promise<{
    transactionId: string;
    wsId: string;
  }>;
}

const TransactionUpdateSchema = z.object({
  description: z.string().optional(),
  amount: z.number().optional(),
  origin_wallet_id: z.uuid().optional(),
  category_id: z.uuid().optional(),
  taken_at: z.string().or(z.date()).optional(),
  report_opt_in: z.boolean().optional(),
  tag_ids: z.array(z.uuid()).optional(),
  is_amount_confidential: z.boolean().optional(),
  is_description_confidential: z.boolean().optional(),
  is_category_confidential: z.boolean().optional(),
});

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { transactionId, wsId } = await params;

  // Validate UUID format
  if (!transactionId || !wsId) {
    return NextResponse.json(
      { message: 'Invalid transaction or workspace ID' },
      { status: 400 }
    );
  }

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('view_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Verify transaction belongs to workspace and fetch full data
  const transaction = await verifyTransactionWorkspace(transactionId, wsId);

  if (!transaction) {
    return NextResponse.json(
      { message: 'Transaction not found' },
      { status: 404 }
    );
  }

  // Get authenticated user for permission checks
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Use redaction function to get transaction with permission-based field redaction
  const { data, error } = await supabase.rpc(
    'get_wallet_transactions_with_permissions',
    {
      p_ws_id: wsId,
      p_user_id: user.id,
      p_transaction_ids: [transactionId],
    }
  );

  if (error || !data || data.length === 0) {
    console.error('Error fetching transaction:', {
      transactionId,
      error: error?.message,
    });
    return NextResponse.json(
      { message: 'Transaction not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(data[0]);
}

export async function PUT(req: Request, { params }: Params) {
  const { transactionId, wsId } = await params;

  // Validate UUID format
  if (!transactionId || !wsId) {
    return NextResponse.json(
      { message: 'Invalid transaction or workspace ID' },
      { status: 400 }
    );
  }

  const parsed = TransactionUpdateSchema.safeParse(await req.json());

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

  // Verify transaction belongs to workspace
  const transaction = await verifyTransactionWorkspace(transactionId, wsId);

  if (!transaction) {
    return NextResponse.json(
      { message: 'Transaction not found' },
      { status: 404 }
    );
  }

  const newData = {
    ...data,
    wallet_id: data.origin_wallet_id,
  };

  delete newData.origin_wallet_id;
  const tagIds = newData.tag_ids;
  delete newData.tag_ids;

  // Check if confidential fields are being modified
  const isModifyingConfidential =
    newData.is_amount_confidential !== undefined ||
    newData.is_description_confidential !== undefined ||
    newData.is_category_confidential !== undefined;

  // If updating confidential fields, check permission
  if (
    isModifyingConfidential &&
    withoutPermission('update_confidential_transactions')
  ) {
    return NextResponse.json(
      {
        message: 'Insufficient permissions to update confidential transactions',
      },
      { status: 403 }
    );
  }

  // Fetch existing transaction to check if it's already confidential
  const { data: existingTx } = await supabase
    .from('wallet_transactions')
    .select(
      'is_amount_confidential, is_description_confidential, is_category_confidential'
    )
    .eq('id', transactionId)
    .single();

  const isAlreadyConfidential =
    existingTx?.is_amount_confidential ||
    existingTx?.is_description_confidential ||
    existingTx?.is_category_confidential;

  // If transaction is already confidential, require permission to update
  if (
    isAlreadyConfidential &&
    withoutPermission('update_confidential_transactions')
  ) {
    return NextResponse.json(
      {
        message: 'Insufficient permissions to update confidential transactions',
      },
      { status: 403 }
    );
  }

  // Verify new wallet belongs to workspace if being changed
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
        : newData.taken_at instanceof Date
          ? newData.taken_at.toISOString()
          : newData.taken_at;
  }
  if (newData.report_opt_in !== undefined) {
    updatePayload.report_opt_in = newData.report_opt_in;
  }
  if (newData.is_amount_confidential !== undefined) {
    updatePayload.is_amount_confidential = newData.is_amount_confidential;
  }
  if (newData.is_description_confidential !== undefined) {
    updatePayload.is_description_confidential =
      newData.is_description_confidential;
  }
  if (newData.is_category_confidential !== undefined) {
    updatePayload.is_category_confidential = newData.is_category_confidential;
  }

  const { error } = await supabase
    .from('wallet_transactions')
    .update(updatePayload)
    .eq('id', transactionId);

  if (error) {
    console.error('Error updating transaction:', {
      transactionId: transactionId,
      error: error.message,
      updatePayload,
    });
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

  // Validate UUID format
  if (!transactionId || !wsId) {
    return NextResponse.json(
      { message: 'Invalid transaction or workspace ID' },
      { status: 400 }
    );
  }

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
  const transaction = await verifyTransactionWorkspace(transactionId, wsId);

  if (!transaction) {
    return NextResponse.json(
      { message: 'Transaction not found' },
      { status: 404 }
    );
  }

  // Check if transaction is confidential
  const { data: txData } = await supabase
    .from('wallet_transactions')
    .select(
      'is_amount_confidential, is_description_confidential, is_category_confidential'
    )
    .eq('id', transactionId)
    .single();

  const isConfidential =
    txData?.is_amount_confidential ||
    txData?.is_description_confidential ||
    txData?.is_category_confidential;

  // If transaction is confidential, require permission to delete
  if (isConfidential && withoutPermission('delete_confidential_transactions')) {
    return NextResponse.json(
      {
        message: 'Insufficient permissions to delete confidential transactions',
      },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('wallet_transactions')
    .delete()
    .eq('id', transactionId);

  if (error) {
    console.error('Error deleting transaction:', {
      transactionId,
      error: error.message,
    });
    return NextResponse.json(
      { message: 'Error deleting transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
