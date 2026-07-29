import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import type {
  InventoryFinanceEntry,
  InventoryFinanceEntryKind,
  InventoryFinanceEntryStatus,
  InventoryFinanceProvider,
} from '@tuturuuu/internal-api/finance-reconciliation';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  buildReconciliationSummary,
  currencySchema,
  decodeReconciliationCursor,
  encodeReconciliationCursor,
  entryKindSchema,
  entryStatusSchema,
  inventorySource,
  providerSchema,
  type SummaryRow,
} from './lib';
import { privateFinanceDataClient } from './private-client';

const querySchema = z.object({
  currency: currencySchema.optional(),
  cursor: z.string().max(1000).optional(),
  endDate: z.iso.datetime({ offset: true }).optional(),
  kind: entryKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  provider: providerSchema.optional(),
  startDate: z.iso.datetime({ offset: true }).optional(),
  status: entryStatusSchema.optional(),
  walletId: z.guid().optional(),
});

type EntryRow = {
  amount: number;
  amount_minor: number;
  checkout_session_id: string | null;
  currency: string;
  entry_kind: string;
  id: string;
  occurred_at: string;
  provider: string;
  provider_reference_id: string | null;
  provider_status: string | null;
  reconciliation_status: string;
  synchronization_error: string | null;
  wallet_transaction_id: string | null;
};

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  await connection();
  try {
    const { wsId } = await params;
    const searchParams = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid reconciliation query' },
        { status: 400 }
      );
    }
    const cursor = decodeReconciliationCursor(parsed.data.cursor ?? null);
    if (parsed.data.cursor && !cursor) {
      return NextResponse.json({ message: 'Invalid cursor' }, { status: 400 });
    }

    const access = await getFinanceRouteContext(
      request,
      wsId,
      await resolveFinanceRouteAuthContext(request)
    );
    if (access.response) return access.response;
    const { normalizedWsId, permissions, sbAdmin } = access.context;
    if (permissions.withoutPermission('manage_finance')) {
      return NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const privateClient = privateFinanceDataClient(sbAdmin);
    const walletTransactionIds = parsed.data.walletId
      ? (
          (
            await sbAdmin
              .from('wallet_transactions')
              .select('id')
              .eq('wallet_id', parsed.data.walletId)
          ).data ?? []
        ).map((transaction) => transaction.id)
      : null;
    let query = privateClient
      .from<EntryRow>('inventory_finance_entries')
      .select(
        'id, checkout_session_id, provider, entry_kind, provider_reference_id, amount_minor, amount, currency, occurred_at, provider_status, reconciliation_status, wallet_transaction_id, synchronization_error'
      )
      .eq('ws_id', normalizedWsId)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(parsed.data.limit + 1);
    if (walletTransactionIds) {
      query =
        walletTransactionIds.length > 0
          ? query.in('wallet_transaction_id', walletTransactionIds)
          : query.eq('id', '00000000-0000-0000-0000-000000000000');
    }
    if (parsed.data.provider) {
      query = query.eq('provider', parsed.data.provider);
    }
    if (parsed.data.kind) query = query.eq('entry_kind', parsed.data.kind);
    if (parsed.data.currency) {
      query = query.eq('currency', parsed.data.currency);
    }
    if (parsed.data.status) {
      query = query.eq('reconciliation_status', parsed.data.status);
    }
    if (parsed.data.startDate) {
      query = query.gte('occurred_at', parsed.data.startDate);
    }
    if (parsed.data.endDate) {
      query = query.lte('occurred_at', parsed.data.endDate);
    }
    if (cursor) {
      query = query.or(
        `occurred_at.lt.${cursor.occurredAt},and(occurred_at.eq.${cursor.occurredAt},id.lt.${cursor.id})`
      );
    }

    const [{ data: entryData, error: entryError }, summaryResult] =
      await Promise.all([
        query,
        privateClient.rpc<SummaryRow>(
          'get_inventory_finance_reconciliation_summary',
          {
            p_end_date: parsed.data.endDate ?? null,
            p_start_date: parsed.data.startDate ?? null,
            p_wallet_id: parsed.data.walletId ?? null,
            p_ws_id: normalizedWsId,
          }
        ),
      ]);
    if (entryError) throw entryError;
    if (summaryResult.error) throw summaryResult.error;

    const allRows = (entryData ?? []) as EntryRow[];
    const hasMore = allRows.length > parsed.data.limit;
    const rows = allRows.slice(0, parsed.data.limit);
    const checkoutIds = rows
      .map((row) => row.checkout_session_id)
      .filter((id): id is string => Boolean(id));
    const transactionIds = rows
      .map((row) => row.wallet_transaction_id)
      .filter((id): id is string => Boolean(id));

    const [{ data: checkouts }, { data: transactions }] = await Promise.all([
      checkoutIds.length
        ? privateClient
            .from<{
              customer_email: string;
              customer_name: string;
              id: string;
            }>('inventory_checkout_sessions')
            .select('id, customer_email, customer_name')
            .in('id', checkoutIds)
        : Promise.resolve({ data: [] }),
      transactionIds.length
        ? sbAdmin
            .from('wallet_transactions')
            .select('id, wallet_id, category_id')
            .in('id', transactionIds)
        : Promise.resolve({ data: [] }),
    ]);
    const walletIds = (transactions ?? [])
      .map((transaction) => transaction.wallet_id)
      .filter((id): id is string => Boolean(id));
    const categoryIds = (transactions ?? [])
      .map((transaction) => transaction.category_id)
      .filter((id): id is string => Boolean(id));
    const [{ data: wallets }, { data: categories }] = await Promise.all([
      walletIds.length
        ? privateClient
            .from<{ id: string; name: string | null }>('workspace_wallets')
            .select('id, name')
            .in('id', walletIds)
        : Promise.resolve({ data: [] }),
      categoryIds.length
        ? sbAdmin
            .from('transaction_categories')
            .select('id, name')
            .in('id', categoryIds)
        : Promise.resolve({ data: [] }),
    ]);

    const checkoutById = new Map(
      (checkouts ?? []).map((checkout) => [checkout.id, checkout])
    );
    const transactionById = new Map(
      (transactions ?? []).map((transaction) => [transaction.id, transaction])
    );
    const walletById = new Map(
      (wallets ?? []).map((wallet) => [wallet.id, wallet])
    );
    const categoryById = new Map(
      (categories ?? []).map((category) => [category.id, category])
    );

    const data: InventoryFinanceEntry[] = rows.map((row) => {
      const checkout = row.checkout_session_id
        ? checkoutById.get(row.checkout_session_id)
        : null;
      const transaction = row.wallet_transaction_id
        ? transactionById.get(row.wallet_transaction_id)
        : null;
      const provider = row.provider as InventoryFinanceProvider;
      const kind = row.entry_kind as InventoryFinanceEntryKind;
      const providerReferenceId = row.provider_reference_id ?? row.id;
      const wallet = transaction?.wallet_id
        ? walletById.get(transaction.wallet_id)
        : null;
      const category = transaction?.category_id
        ? categoryById.get(transaction.category_id)
        : null;
      return {
        amount: Number(row.amount),
        amountMinor: Number(row.amount_minor),
        category: category
          ? { id: category.id, name: category.name ?? '' }
          : null,
        checkoutId: row.checkout_session_id,
        currency: row.currency,
        customer: checkout
          ? {
              email: checkout.customer_email,
              name: checkout.customer_name,
            }
          : null,
        id: row.id,
        kind,
        occurredAt: row.occurred_at,
        provider,
        providerReferenceId,
        providerStatus: row.provider_status,
        source: inventorySource({
          checkoutId: row.checkout_session_id,
          entryId: row.id,
          kind,
          provider,
          providerReferenceId,
          wsId: normalizedWsId,
        }),
        status: row.reconciliation_status as InventoryFinanceEntryStatus,
        synchronizationError: row.synchronization_error,
        transactionId: row.wallet_transaction_id,
        wallet: wallet ? { id: wallet.id, name: wallet.name ?? '' } : null,
      };
    });
    const last = data.at(-1);

    return NextResponse.json({
      data,
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeReconciliationCursor({
              id: last.id,
              occurredAt: last.occurredAt,
            })
          : null,
      summary: buildReconciliationSummary(summaryResult.data ?? []),
    });
  } catch (error) {
    console.error('Inventory Finance reconciliation list failed', error);
    return NextResponse.json(
      { message: 'Failed to load Inventory reconciliation' },
      { status: 500 }
    );
  }
}
