import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  canReassignFinanceWallet,
  canUseRequestedFinanceWalletOnCreate,
} from '@tuturuuu/utils/finance';
import {
  getPermissions,
  getWorkspaceConfig,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const NORMALIZATION_ERROR_MESSAGES = new Set([
  'User not authenticated',
  'Personal workspace not found',
  'Invalid workspace',
]);

function isWorkspaceNormalizationError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;

  return (
    NORMALIZATION_ERROR_MESSAGES.has(error.message) ||
    error.name === 'WorkspaceAuthError' ||
    error.name === 'WorkspaceAccessError' ||
    error.name === 'WorkspaceRedirectRequiredError'
  );
}

type TransferIntegrityIncident = {
  wsId: string;
  fromTransactionId: string;
  toTransactionId: string;
  linkError: string;
  cleanupError?: string;
};

function notifyTransferIntegrityIncident(incident: TransferIntegrityIncident) {
  console.error('[FinanceTransferIntegrityIncident]', incident);
  process.emit('finance-transfer-integrity-incident', incident);
}

const TransferSchema = z
  .object({
    origin_wallet_id: z.guid(),
    destination_wallet_id: z.guid(),
    amount: z.number().positive(),
    destination_amount: z.number().positive().optional(),
    description: z.string().optional(),
    taken_at: z.union([z.string(), z.date()]),
    report_opt_in: z.boolean().optional(),
    tag_ids: z.array(z.guid()).optional(),
  })
  .refine((data) => data.origin_wallet_id !== data.destination_wallet_id, {
    message: 'Source and destination wallets must be different',
    path: ['destination_wallet_id'],
  });

const UpdateTransferSchema = z
  .object({
    origin_transaction_id: z.guid(),
    destination_transaction_id: z.guid(),
    origin_wallet_id: z.guid(),
    destination_wallet_id: z.guid(),
    amount: z.number().positive(),
    destination_amount: z.number().positive().optional(),
    description: z.string().optional(),
    taken_at: z.union([z.string(), z.date()]),
    report_opt_in: z.boolean().optional(),
    tag_ids: z.array(z.guid()).optional(),
  })
  .refine(
    (data) => data.origin_transaction_id !== data.destination_transaction_id,
    {
      message: 'Source and destination transactions must be different',
      path: ['destination_transaction_id'],
    }
  )
  .refine((data) => data.origin_wallet_id !== data.destination_wallet_id, {
    message: 'Source and destination wallets must be different',
    path: ['destination_wallet_id'],
  });

export async function PUT(req: Request, { params }: Params) {
  const { wsId } = await params;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  let normalizedWsId: string;

  try {
    normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '';

    if (errorMessage === 'User not authenticated') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (errorMessage === 'Personal workspace not found') {
      return NextResponse.json(
        { message: 'Workspace not found' },
        { status: 404 }
      );
    }

    if (isWorkspaceNormalizationError(error)) {
      return NextResponse.json(
        { message: 'Invalid workspace' },
        { status: 400 }
      );
    }

    console.error('Unexpected workspace normalization error in transfers API', {
      wsId,
      error,
    });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }

  const permissions = await getPermissions({
    wsId: normalizedWsId,
    request: req,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  if (withoutPermission('update_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const parsed = UpdateTransferSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const takenAt =
    typeof data.taken_at === 'string'
      ? new Date(data.taken_at).toISOString()
      : data.taken_at.toISOString();

  const pairTransactionIds = [
    data.origin_transaction_id,
    data.destination_transaction_id,
  ];

  const { data: linkedTransfers, error: linkedTransfersError } = await supabase
    .from('workspace_wallet_transfers')
    .select('from_transaction_id, to_transaction_id')
    .in('from_transaction_id', pairTransactionIds)
    .in('to_transaction_id', pairTransactionIds);

  const linkedTransfer = linkedTransfers?.find((transfer) => {
    const idSet = new Set([
      transfer.from_transaction_id,
      transfer.to_transaction_id,
    ]);
    return (
      idSet.has(data.origin_transaction_id) &&
      idSet.has(data.destination_transaction_id)
    );
  });

  if (linkedTransfersError || !linkedTransfer) {
    return NextResponse.json(
      { message: 'Transfer not found' },
      { status: 404 }
    );
  }

  const { data: existingTransferTransactions, error: existingTransferError } =
    await sbAdmin
      .from('wallet_transactions')
      .select('id, wallet_id')
      .in('id', pairTransactionIds);

  if (
    existingTransferError ||
    !existingTransferTransactions ||
    existingTransferTransactions.length !== 2
  ) {
    return NextResponse.json(
      { message: 'Transfer transactions not found' },
      { status: 404 }
    );
  }

  const existingOriginTransaction = existingTransferTransactions.find(
    (transaction) => transaction.id === data.origin_transaction_id
  );
  const existingDestinationTransaction = existingTransferTransactions.find(
    (transaction) => transaction.id === data.destination_transaction_id
  );

  if (!existingOriginTransaction || !existingDestinationTransaction) {
    return NextResponse.json(
      { message: 'Transfer transactions not found' },
      { status: 404 }
    );
  }

  if (
    !canReassignFinanceWallet({
      permissions,
      currentWalletId: existingOriginTransaction.wallet_id,
      requestedWalletId: data.origin_wallet_id,
    }) ||
    !canReassignFinanceWallet({
      permissions,
      currentWalletId: existingDestinationTransaction.wallet_id,
      requestedWalletId: data.destination_wallet_id,
    })
  ) {
    return NextResponse.json(
      {
        message: 'Insufficient permissions to change wallets for transfers',
      },
      { status: 403 }
    );
  }

  const { data: wallets, error: walletsErr } = await sbAdmin
    .from('workspace_wallets')
    .select('id, currency')
    .eq('ws_id', normalizedWsId)
    .in('id', [data.origin_wallet_id, data.destination_wallet_id]);

  if (walletsErr || !wallets || wallets.length !== 2) {
    return NextResponse.json({ message: 'Invalid wallets' }, { status: 400 });
  }

  const originWallet = wallets.find((w) => w.id === data.origin_wallet_id);
  const destWallet = wallets.find((w) => w.id === data.destination_wallet_id);

  if (!originWallet || !destWallet) {
    return NextResponse.json({ message: 'Invalid wallets' }, { status: 400 });
  }

  if (!originWallet.currency || !destWallet.currency) {
    return NextResponse.json({ message: 'Invalid wallets' }, { status: 400 });
  }

  const isCrossCurrency =
    originWallet.currency.toUpperCase() !== destWallet.currency.toUpperCase();

  if (isCrossCurrency && !data.destination_amount) {
    return NextResponse.json(
      {
        message: 'Destination amount is required for cross-currency transfers',
      },
      { status: 400 }
    );
  }

  const destinationAmount = isCrossCurrency
    ? data.destination_amount!
    : data.amount;

  const { data: transferTransactions, error: transferTransactionsError } =
    await supabase
      .from('wallet_transactions')
      .select('id, wallet_id')
      .in('id', pairTransactionIds)
      .in('wallet_id', [data.origin_wallet_id, data.destination_wallet_id]);

  if (
    transferTransactionsError ||
    !transferTransactions ||
    transferTransactions.length !== 2
  ) {
    return NextResponse.json(
      { message: 'Transfer transactions not found' },
      { status: 404 }
    );
  }

  const originUpdate: {
    id: string;
    amount: number;
    description?: string;
    wallet_id: string;
    category_id: null;
    taken_at: string;
    report_opt_in?: boolean;
  } = {
    id: data.origin_transaction_id,
    amount: -Math.abs(data.amount),
    description: data.description,
    wallet_id: data.origin_wallet_id,
    category_id: null,
    taken_at: takenAt,
  };

  const destinationUpdate: {
    id: string;
    amount: number;
    description?: string;
    wallet_id: string;
    category_id: null;
    taken_at: string;
    report_opt_in?: boolean;
  } = {
    id: data.destination_transaction_id,
    amount: Math.abs(destinationAmount),
    description: data.description,
    wallet_id: data.destination_wallet_id,
    category_id: null,
    taken_at: takenAt,
  };

  if (data.report_opt_in !== undefined) {
    originUpdate.report_opt_in = data.report_opt_in;
    destinationUpdate.report_opt_in = data.report_opt_in;
  }

  const { error: updateError } = await sbAdmin
    .from('wallet_transactions')
    .upsert([originUpdate, destinationUpdate], { onConflict: 'id' });

  if (updateError) {
    console.error('Error updating transfer transactions:', updateError);
    return NextResponse.json(
      { message: 'Error updating transfer' },
      { status: 500 }
    );
  }

  if (data.tag_ids !== undefined) {
    const txIds = [data.origin_transaction_id, data.destination_transaction_id];

    const { error: deleteTagError } = await sbAdmin
      .from('wallet_transaction_tags')
      .delete()
      .in('transaction_id', txIds);

    if (!deleteTagError && data.tag_ids.length > 0) {
      const tagInserts = data.tag_ids.flatMap((tagId) => [
        { transaction_id: data.origin_transaction_id, tag_id: tagId },
        { transaction_id: data.destination_transaction_id, tag_id: tagId },
      ]);

      const { error: insertTagError } = await sbAdmin
        .from('wallet_transaction_tags')
        .insert(tagInserts);

      if (insertTagError) {
        console.error('Error updating transfer tags:', insertTagError);
      }
    } else if (deleteTagError) {
      console.error('Error clearing transfer tags:', deleteTagError);
    }
  }

  return NextResponse.json({ message: 'success' });
}

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  let normalizedWsId: string;

  try {
    normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '';

    if (errorMessage === 'User not authenticated') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (errorMessage === 'Personal workspace not found') {
      return NextResponse.json(
        { message: 'Workspace not found' },
        { status: 404 }
      );
    }

    if (isWorkspaceNormalizationError(error)) {
      return NextResponse.json(
        { message: 'Invalid workspace' },
        { status: 400 }
      );
    }

    console.error('Unexpected workspace normalization error in transfers API', {
      wsId,
      error,
    });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }

  const permissions = await getPermissions({
    wsId: normalizedWsId,
    request: req,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  if (withoutPermission('create_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const defaultWalletId = await getWorkspaceConfig(
    normalizedWsId,
    'default_wallet_id'
  );

  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Get virtual_user_id for this workspace
  let { data: wsUser } = await supabase
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', user.id)
    .eq('ws_id', normalizedWsId)
    .single();

  if (!wsUser?.virtual_user_id) {
    // Auto-repair link if missing
    const membership = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase,
    });

    if (!membership.ok) {
      return NextResponse.json(
        { message: 'User is not a member of this workspace' },
        { status: 403 }
      );
    }

    try {
      await sbAdmin.rpc('ensure_workspace_user_link', {
        target_user_id: user.id,
        target_ws_id: normalizedWsId,
      });

      const { data: repairedUser } = await supabase
        .from('workspace_user_linked_users')
        .select('virtual_user_id')
        .eq('platform_user_id', user.id)
        .eq('ws_id', normalizedWsId)
        .single();

      wsUser = repairedUser;
    } catch (repairError) {
      console.error('Failed to auto-repair workspace user link:', repairError);
    }
  }

  if (!wsUser?.virtual_user_id) {
    return NextResponse.json(
      { message: 'User not found in workspace' },
      { status: 403 }
    );
  }

  const parsed = TransferSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const takenAt =
    typeof data.taken_at === 'string'
      ? new Date(data.taken_at).toISOString()
      : data.taken_at.toISOString();

  if (
    !canUseRequestedFinanceWalletOnCreate({
      permissions,
      defaultWalletId,
      requestedWalletId: data.origin_wallet_id,
    })
  ) {
    return NextResponse.json(
      {
        message:
          'Insufficient permissions to override the default wallet for new transactions',
      },
      { status: 403 }
    );
  }

  // Validate both wallets belong to this workspace
  const { data: wallets, error: walletsErr } = await sbAdmin
    .from('workspace_wallets')
    .select('id, currency')
    .eq('ws_id', normalizedWsId)
    .in('id', [data.origin_wallet_id, data.destination_wallet_id]);

  if (walletsErr || !wallets || wallets.length !== 2) {
    return NextResponse.json({ message: 'Invalid wallets' }, { status: 400 });
  }

  const originWallet = wallets.find((w) => w.id === data.origin_wallet_id);
  const destWallet = wallets.find((w) => w.id === data.destination_wallet_id);

  if (!originWallet || !destWallet) {
    return NextResponse.json({ message: 'Invalid wallets' }, { status: 400 });
  }

  if (!originWallet.currency || !destWallet.currency) {
    return NextResponse.json({ message: 'Invalid wallets' }, { status: 400 });
  }

  const isCrossCurrency =
    originWallet.currency.toUpperCase() !== destWallet.currency.toUpperCase();

  // For cross-currency transfers, destination_amount is required
  if (isCrossCurrency && !data.destination_amount) {
    return NextResponse.json(
      {
        message: 'Destination amount is required for cross-currency transfers',
      },
      { status: 400 }
    );
  }

  const destinationAmount = isCrossCurrency
    ? data.destination_amount!
    : data.amount;

  // Create "from" transaction (negative amount = outflow)
  const { data: fromTx, error: fromErr } = await sbAdmin
    .from('wallet_transactions')
    .insert({
      amount: -Math.abs(data.amount),
      description: data.description,
      wallet_id: data.origin_wallet_id,
      category_id: null,
      taken_at: takenAt,
      report_opt_in: data.report_opt_in ?? false,
      creator_id: wsUser.virtual_user_id,
    })
    .select('id')
    .single();

  if (fromErr || !fromTx) {
    console.error('Error creating from-transaction:', fromErr);
    return NextResponse.json(
      { message: 'Error creating transfer' },
      { status: 500 }
    );
  }

  // Create "to" transaction (positive amount = inflow)
  const { data: toTx, error: toErr } = await sbAdmin
    .from('wallet_transactions')
    .insert({
      amount: Math.abs(destinationAmount),
      description: data.description,
      wallet_id: data.destination_wallet_id,
      category_id: null,
      taken_at: takenAt,
      report_opt_in: data.report_opt_in ?? false,
      creator_id: wsUser.virtual_user_id,
    })
    .select('id')
    .single();

  if (toErr || !toTx) {
    console.error('Error creating to-transaction:', toErr);
    // Clean up the from-transaction
    await sbAdmin.from('wallet_transactions').delete().eq('id', fromTx.id);
    return NextResponse.json(
      { message: 'Error creating transfer' },
      { status: 500 }
    );
  }

  // Link transactions in workspace_wallet_transfers
  // Use admin client to bypass the same-abs-amount RLS check for cross-currency
  const { error: linkErr } = await sbAdmin
    .from('workspace_wallet_transfers')
    .insert({
      from_transaction_id: fromTx.id,
      to_transaction_id: toTx.id,
    });

  if (linkErr) {
    console.error('Error linking transfer transactions:', linkErr);
    // Validate user still has access to both transactions before admin cleanup
    const { data: rollbackValidationRows, error: rollbackValidationError } =
      await sbAdmin
        .from('wallet_transactions')
        .select('id')
        .in('id', [fromTx.id, toTx.id]);

    const rollbackValidationFailed =
      !!rollbackValidationError ||
      !rollbackValidationRows ||
      rollbackValidationRows.length !== 2;

    // Clean up both transactions with admin client to bypass auth.uid() trigger paths
    const deleteTransfersResult = await sbAdmin
      .from('wallet_transactions')
      .delete()
      .in('id', [fromTx.id, toTx.id]);

    if (rollbackValidationFailed || deleteTransfersResult.error) {
      const cleanupDetails = [
        rollbackValidationFailed
          ? rollbackValidationError?.message ||
            'Rollback validation did not return both transfer rows'
          : null,
        deleteTransfersResult.error?.message,
      ]
        .filter(Boolean)
        .join(' | ');

      notifyTransferIntegrityIncident({
        wsId: normalizedWsId,
        fromTransactionId: fromTx.id,
        toTransactionId: toTx.id,
        linkError: linkErr.message,
        cleanupError: cleanupDetails,
      });

      return NextResponse.json(
        {
          message: 'Transfer rollback integrity error',
          fromTransactionId: fromTx.id,
          toTransactionId: toTx.id,
          linkError: linkErr.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Error creating transfer link' },
      { status: 500 }
    );
  }

  // Apply tags to both transactions
  if (data.tag_ids && data.tag_ids.length > 0) {
    const tagInserts = data.tag_ids.flatMap((tagId) => [
      { transaction_id: fromTx.id, tag_id: tagId },
      { transaction_id: toTx.id, tag_id: tagId },
    ]);

    const { error: tagError } = await sbAdmin
      .from('wallet_transaction_tags')
      .insert(tagInserts);

    if (tagError) {
      console.error('Error adding tags to transfer:', tagError);
    }
  }

  return NextResponse.json({
    message: 'success',
    from_transaction_id: fromTx.id,
    to_transaction_id: toTx.id,
  });
}
