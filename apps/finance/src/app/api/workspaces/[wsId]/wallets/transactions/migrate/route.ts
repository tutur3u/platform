import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const TransactionSchema = z.object({
  id: z.guid().optional(),
  wallet_id: z.guid(),
  amount: z.number().nullable().optional(),
  category_id: z.guid().nullable().optional(),
  invoice_id: z.guid().nullable().optional(),
  description: z.string().nullable().optional(),
  taken_at: z.iso.datetime().optional(),
  is_amount_confidential: z.boolean().optional(),
  is_category_confidential: z.boolean().optional(),
  is_description_confidential: z.boolean().optional(),
  report_opt_in: z.boolean().optional(),
});
const BodySchema = z.object({
  transactions: z.array(TransactionSchema).max(500),
});

type Params = { params: Promise<{ wsId: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { wsId } = await params;
  const actor = await resolveSatelliteRequestActor(request, 'finance');
  if (!actor)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const permissions = await getPermissions({ user: actor.user, wsId });
  if (!permissions?.containsPermission('manage_finance')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }
  const transactions = parsed.data.transactions;
  if (transactions.length === 0)
    return NextResponse.json({ message: 'success' });

  const ids = transactions.flatMap((transaction) =>
    transaction.id ? [transaction.id] : []
  );
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json(
      { message: 'Duplicate transaction IDs' },
      { status: 400 }
    );
  }
  const { data: existing, error: existingError } = ids.length
    ? await actor.admin
        .from('wallet_transactions')
        .select('id, wallet_id')
        .in('id', ids)
    : { data: [], error: null };
  if (existingError) {
    return NextResponse.json(
      { message: 'Failed to validate transactions' },
      { status: 500 }
    );
  }

  const walletIds = [
    ...new Set([
      ...transactions.map((transaction) => transaction.wallet_id),
      ...(existing ?? []).map((transaction) => transaction.wallet_id),
    ]),
  ];
  const { data: wallets, error: walletsError } = await actor.admin
    .schema('private')
    .from('workspace_wallets')
    .select('id')
    .in('id', walletIds)
    .eq('ws_id', permissions.wsId);
  if (walletsError) {
    return NextResponse.json(
      { message: 'Failed to validate wallets' },
      { status: 500 }
    );
  }
  if (wallets?.length !== walletIds.length) {
    return NextResponse.json(
      { message: 'Wallet belongs to another workspace' },
      { status: 403 }
    );
  }

  const categoryIds = [
    ...new Set(
      transactions.flatMap((transaction) =>
        transaction.category_id ? [transaction.category_id] : []
      )
    ),
  ];
  if (categoryIds.length > 0) {
    const { data: categories, error } = await actor.admin
      .from('transaction_categories')
      .select('id')
      .in('id', categoryIds)
      .eq('ws_id', permissions.wsId);
    if (error)
      return NextResponse.json(
        { message: 'Failed to validate categories' },
        { status: 500 }
      );
    if (categories?.length !== categoryIds.length) {
      return NextResponse.json(
        { message: 'Category belongs to another workspace' },
        { status: 403 }
      );
    }
  }

  const invoiceIds = [
    ...new Set(
      transactions.flatMap((transaction) =>
        transaction.invoice_id ? [transaction.invoice_id] : []
      )
    ),
  ];
  if (invoiceIds.length > 0) {
    const { data: invoices, error } = await actor.admin
      .from('finance_invoices')
      .select('id')
      .in('id', invoiceIds)
      .eq('ws_id', permissions.wsId);
    if (error)
      return NextResponse.json(
        { message: 'Failed to validate invoices' },
        { status: 500 }
      );
    if (invoices?.length !== invoiceIds.length) {
      return NextResponse.json(
        { message: 'Invoice belongs to another workspace' },
        { status: 403 }
      );
    }
  }

  const { error } = await actor.admin.from('wallet_transactions').upsert(
    transactions.map((transaction) => ({
      ...transaction,
      platform_creator_id: actor.user.id,
    }))
  );
  if (error) {
    console.error('Error migrating workspace transactions', error);
    return NextResponse.json(
      { message: 'Error migrating workspace transactions' },
      { status: 500 }
    );
  }
  return NextResponse.json({ message: 'success' });
}
