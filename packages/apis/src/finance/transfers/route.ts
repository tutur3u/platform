import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const TransferSchema = z
  .object({
    origin_wallet_id: z.string().uuid(),
    destination_wallet_id: z.string().uuid(),
    amount: z.number().positive(),
    destination_amount: z.number().positive().optional(),
    description: z.string().optional(),
    taken_at: z.union([z.string(), z.date()]),
    report_opt_in: z.boolean().optional(),
    tag_ids: z.array(z.string().uuid()).optional(),
  })
  .refine((data) => data.origin_wallet_id !== data.destination_wallet_id, {
    message: 'Source and destination wallets must be different',
    path: ['destination_wallet_id'],
  });

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;

  const { withoutPermission } = await getPermissions({ wsId });

  if (withoutPermission('create_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const resolvedWsId = resolveWorkspaceId(wsId);

  // Get virtual_user_id for this workspace
  let { data: wsUser } = await supabase
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', user.id)
    .eq('ws_id', resolvedWsId)
    .single();

  if (!wsUser?.virtual_user_id) {
    // Auto-repair link if missing
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('ws_id', resolvedWsId)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json(
        { message: 'User is not a member of this workspace' },
        { status: 403 }
      );
    }

    try {
      const sbAdmin = await createAdminClient();
      await sbAdmin.rpc('ensure_workspace_user_link', {
        target_user_id: user.id,
        target_ws_id: resolvedWsId,
      });

      const { data: repairedUser } = await supabase
        .from('workspace_user_linked_users')
        .select('virtual_user_id')
        .eq('platform_user_id', user.id)
        .eq('ws_id', resolvedWsId)
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

  // Validate both wallets belong to this workspace
  const { data: wallets, error: walletsErr } = await supabase
    .from('workspace_wallets')
    .select('id, currency')
    .eq('ws_id', wsId)
    .in('id', [data.origin_wallet_id, data.destination_wallet_id]);

  if (walletsErr || !wallets || wallets.length !== 2) {
    return NextResponse.json({ message: 'Invalid wallets' }, { status: 400 });
  }

  const originWallet = wallets.find((w) => w.id === data.origin_wallet_id);
  const destWallet = wallets.find((w) => w.id === data.destination_wallet_id);

  if (!originWallet || !destWallet) {
    return NextResponse.json({ message: 'Invalid wallets' }, { status: 400 });
  }

  const isCrossCurrency =
    originWallet.currency?.toUpperCase() !== destWallet.currency?.toUpperCase();

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
  const { data: fromTx, error: fromErr } = await supabase
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
  const { data: toTx, error: toErr } = await supabase
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
    await supabase.from('wallet_transactions').delete().eq('id', fromTx.id);
    return NextResponse.json(
      { message: 'Error creating transfer' },
      { status: 500 }
    );
  }

  // Link transactions in workspace_wallet_transfers
  // Use admin client to bypass the same-abs-amount RLS check for cross-currency
  const sbAdmin = await createAdminClient();
  const { error: linkErr } = await sbAdmin
    .from('workspace_wallet_transfers')
    .insert({
      from_transaction_id: fromTx.id,
      to_transaction_id: toTx.id,
    });

  if (linkErr) {
    console.error('Error linking transfer transactions:', linkErr);
    // Clean up both transactions
    await supabase.from('wallet_transactions').delete().eq('id', fromTx.id);
    await supabase.from('wallet_transactions').delete().eq('id', toTx.id);
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

    const { error: tagError } = await supabase
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
