import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import {
  decideSaleBooking,
  type InventoryFinanceEntryKind,
  type InventoryFinanceProvider,
  normalizeInventoryFinanceAmount,
  resolveCategoryPreference,
  resolveCheckoutProvider,
  resolveCompatibleWalletId,
  resolveSharedFinanceCategoryId,
  type SaleBookingSession,
} from './finance-resolution';

export {
  decideSaleBooking,
  type InventoryFinanceEntryKind,
  type InventoryFinanceProvider,
  normalizeInventoryFinanceAmount,
  resolveCategoryPreference,
  resolveCheckoutProvider,
  resolveCompatibleWalletId,
  resolveSharedFinanceCategoryId,
  type SaleBookingDecision,
} from './finance-resolution';

type CheckoutFinanceSource = SaleBookingSession & {
  completed_at: string | null;
  created_at: string | null;
  currency: string;
  customer_email: string;
  customer_name: string;
  id: string;
  square_order_id: string | null;
  updated_at: string | null;
  ws_id: string;
};

export type RecordSaleResult = {
  booked: boolean;
  entryId?: string;
  reason?: string;
  status?: 'error' | 'linked' | 'pending';
  transactionId?: string;
};

type FinanceDefaults = {
  categoryId: string | null;
  walletId: string | null;
};

type UpsertResultRow = {
  entry_id: string;
  reconciliation_status: 'error' | 'linked' | 'pending';
  synchronization_error: string | null;
  wallet_transaction_id: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function uniqueUuidValues(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values.filter(
        (value): value is string => !!value && UUID_PATTERN.test(value)
      )
    ),
  ];
}

async function loadCheckoutSource(checkoutId: string) {
  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const { data, error } = await sbAdmin
    .schema('private')
    .from('inventory_checkout_sessions')
    .select(
      'id, ws_id, total_amount, currency, status, completed_at, created_at, updated_at, checkout_provider, polar_order_id, square_order_id, square_payment_id, finance_transaction_id, customer_name, customer_email'
    )
    .eq('id', checkoutId)
    .maybeSingle();

  if (error) throw error;
  return { sbAdmin, session: data as CheckoutFinanceSource | null };
}

async function resolveFinanceDefaults({
  checkoutId,
  currency,
  provider,
  sbAdmin,
  wsId,
}: {
  checkoutId: string;
  currency: string;
  provider: InventoryFinanceProvider;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}): Promise<FinanceDefaults> {
  const privateDb = sbAdmin.schema('private');
  const [
    mappingResult,
    inventoryWalletId,
    financeWalletId,
    inventoryCategoryId,
    { data: lines },
  ] = await Promise.all([
    privateDb
      .from('inventory_finance_provider_mappings' as never)
      .select('wallet_id, category_id')
      .eq('ws_id' as never, wsId)
      .eq('provider' as never, provider)
      .eq('currency' as never, currency.toUpperCase())
      .maybeSingle(),
    getWorkspaceConfig(wsId, 'inventory_default_revenue_wallet_id'),
    getWorkspaceConfig(wsId, 'default_wallet_id'),
    getWorkspaceConfig(wsId, 'inventory_default_finance_category_id'),
    privateDb
      .from('inventory_checkout_lines')
      .select('product_id')
      .eq('checkout_session_id', checkoutId),
  ]);
  const mapping = (mappingResult.data ?? null) as {
    category_id: string | null;
    wallet_id: string | null;
  } | null;

  const productIds = [
    ...new Set(
      (lines ?? []).map((line) => line.product_id).filter((id) => Boolean(id))
    ),
  ];
  const { data: products } =
    productIds.length > 0
      ? await sbAdmin
          .from('workspace_products')
          .select('finance_category_id')
          .eq('ws_id', wsId)
          .in('id', productIds)
      : { data: [] };
  const productCategoryId = resolveSharedFinanceCategoryId(
    (products ?? []).map((product) => product.finance_category_id)
  );

  const walletPreferenceIds = uniqueUuidValues([
    mapping?.wallet_id,
    inventoryWalletId,
    financeWalletId,
  ]);
  const { data: wallets } =
    walletPreferenceIds.length > 0
      ? await privateDb
          .from('workspace_wallets')
          .select('id, currency')
          .eq('ws_id', wsId)
          .in('id', walletPreferenceIds)
      : { data: [] };

  const categoryPreferenceIds = uniqueUuidValues([
    productCategoryId,
    mapping?.category_id,
    inventoryCategoryId,
  ]);
  const { data: categories } =
    categoryPreferenceIds.length > 0
      ? await sbAdmin
          .from('transaction_categories')
          .select('id')
          .eq('ws_id', wsId)
          .in('id', categoryPreferenceIds)
      : { data: [] };

  return {
    walletId: resolveCompatibleWalletId({
      candidates: wallets ?? [],
      currency,
      preferenceIds: [mapping?.wallet_id, inventoryWalletId, financeWalletId],
    }),
    categoryId: resolveCategoryPreference({
      availableCategoryIds: (categories ?? []).map((category) => category.id),
      inventoryDefaultCategoryId: inventoryCategoryId,
      productCategoryId,
      providerCategoryId: mapping?.category_id,
    }),
  };
}

function getSaleReference(
  session: CheckoutFinanceSource,
  provider: InventoryFinanceProvider
) {
  if (provider === 'cash') return session.id;
  if (provider === 'polar') return session.polar_order_id ?? session.id;
  return session.square_payment_id ?? session.square_order_id ?? session.id;
}

async function upsertSourceEntry({
  actorId = null,
  amountMinor,
  categoryId,
  checkout,
  description,
  kind,
  linkIfPossible,
  metadata,
  occurredAt,
  parentEntryId = null,
  provider,
  providerReferenceId,
  providerStatus,
  sourceKey,
  walletId,
}: {
  actorId?: string | null;
  amountMinor: number;
  categoryId: string | null;
  checkout: CheckoutFinanceSource;
  description: string;
  kind: InventoryFinanceEntryKind;
  linkIfPossible: boolean;
  metadata?: Record<string, unknown>;
  occurredAt: string;
  parentEntryId?: string | null;
  provider: InventoryFinanceProvider;
  providerReferenceId: string;
  providerStatus: string;
  sourceKey: string;
  walletId: string | null;
}): Promise<RecordSaleResult> {
  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const { data, error } = (await sbAdmin.schema('private').rpc(
    'upsert_inventory_finance_entry' as never,
    {
      p_actor_id: actorId,
      p_amount_minor: amountMinor,
      p_category_id: categoryId,
      p_checkout_session_id: checkout.id,
      p_currency: checkout.currency.toUpperCase(),
      p_description: description,
      p_entry_kind: kind,
      p_link_if_possible: linkIfPossible,
      p_occurred_at: occurredAt,
      p_parent_entry_id: parentEntryId,
      p_provider: provider,
      p_provider_reference_id: providerReferenceId,
      p_provider_status: providerStatus,
      p_source_key: sourceKey,
      p_source_metadata: {
        checkoutId: checkout.id,
        customerEmail: checkout.customer_email,
        customerName: checkout.customer_name,
        ...metadata,
      },
      p_synchronization_error: null,
      p_wallet_id: walletId,
      p_ws_id: checkout.ws_id,
    } as never
  )) as {
    data: UpsertResultRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    return { booked: false, reason: error.message, status: 'error' };
  }
  const row = (data?.[0] ?? null) as UpsertResultRow | null;
  if (!row) return { booked: false, reason: 'upsert-returned-no-entry' };
  return {
    booked: row.reconciliation_status === 'linked',
    entryId: row.entry_id,
    reason:
      row.synchronization_error ??
      (row.reconciliation_status === 'pending'
        ? 'no-compatible-wallet'
        : undefined),
    status: row.reconciliation_status,
    transactionId: row.wallet_transaction_id ?? undefined,
  };
}

/**
 * Record and, when a compatible default exists, atomically post a completed
 * real-provider checkout. Missing defaults produce a durable pending entry.
 */
export async function recordInventorySaleFinanceTransaction({
  checkoutId,
}: {
  checkoutId: string;
}): Promise<RecordSaleResult> {
  try {
    const { sbAdmin, session } = await loadCheckoutSource(checkoutId);
    if (!session) return { booked: false, reason: 'session-not-found' };
    const decision = decideSaleBooking(session);
    if (!decision.book) return { booked: false, reason: decision.reason };

    const provider = resolveCheckoutProvider(session);
    if (!provider) return { booked: false, reason: 'unsupported-provider' };
    const defaults = await resolveFinanceDefaults({
      checkoutId,
      currency: session.currency,
      provider,
      sbAdmin,
      wsId: session.ws_id,
    });
    const reference = getSaleReference(session, provider);

    return upsertSourceEntry({
      amountMinor: session.total_amount,
      categoryId: defaults.categoryId,
      checkout: session,
      description: `${provider === 'polar' ? 'Polar' : provider === 'cash' ? 'Cash' : 'Square'} sale ${reference}`,
      kind: 'sale',
      linkIfPossible: true,
      occurredAt:
        session.completed_at ??
        session.updated_at ??
        session.created_at ??
        new Date().toISOString(),
      provider,
      providerReferenceId: reference,
      providerStatus: 'completed',
      sourceKey: `sale:${reference}`,
      walletId: defaults.walletId,
    });
  } catch (error) {
    return {
      booked: false,
      reason: error instanceof Error ? error.message : 'unexpected-error',
      status: 'error',
    };
  }
}

export async function recordInventoryFinanceAdjustment({
  actorId,
  amountMinor,
  checkoutId,
  kind,
  metadata,
  occurredAt,
  provider,
  providerReferenceId,
  providerStatus = 'completed',
  readyForLedger = true,
  sourceKey,
}: {
  actorId?: string | null;
  amountMinor: number;
  checkoutId: string;
  kind: Exclude<InventoryFinanceEntryKind, 'sale'>;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
  provider: InventoryFinanceProvider;
  providerReferenceId: string;
  providerStatus?: string;
  readyForLedger?: boolean;
  sourceKey: string;
}): Promise<RecordSaleResult> {
  try {
    const { sbAdmin, session } = await loadCheckoutSource(checkoutId);
    if (!session) return { booked: false, reason: 'session-not-found' };
    const checkoutProvider = resolveCheckoutProvider(session);
    if (checkoutProvider !== provider) {
      return { booked: false, reason: 'provider-checkout-mismatch' };
    }

    const { data: saleEntryData } = (await sbAdmin
      .schema('private')
      .from('inventory_finance_entries' as never)
      .select('id, wallet_transaction_id, suggested_category_id')
      .eq('ws_id' as never, session.ws_id)
      .eq('checkout_session_id' as never, session.id)
      .eq('entry_kind' as never, 'sale')
      .maybeSingle()) as {
      data: {
        id: string;
        suggested_category_id: string | null;
        wallet_transaction_id: string | null;
      } | null;
    };
    const saleEntry = saleEntryData;
    const { data: saleTransaction } = saleEntry?.wallet_transaction_id
      ? await sbAdmin
          .from('wallet_transactions')
          .select('wallet_id, category_id')
          .eq('id', saleEntry.wallet_transaction_id)
          .maybeSingle()
      : { data: null };
    const defaults = await resolveFinanceDefaults({
      checkoutId,
      currency: session.currency,
      provider,
      sbAdmin,
      wsId: session.ws_id,
    });
    const signedAmount = normalizeInventoryFinanceAmount(kind, amountMinor);
    if (!signedAmount) return { booked: false, reason: 'zero-amount' };
    const parentIsPending = Boolean(
      saleEntry && !saleEntry.wallet_transaction_id
    );

    return upsertSourceEntry({
      actorId,
      amountMinor: signedAmount,
      categoryId:
        saleTransaction?.category_id ??
        saleEntry?.suggested_category_id ??
        defaults.categoryId,
      checkout: session,
      description: `${provider === 'polar' ? 'Polar' : 'Square'} ${kind.replaceAll('_', ' ')} ${providerReferenceId}`,
      kind,
      linkIfPossible: readyForLedger && !parentIsPending,
      metadata,
      occurredAt: occurredAt ?? new Date().toISOString(),
      parentEntryId: saleEntry?.id ?? null,
      provider,
      providerReferenceId,
      providerStatus,
      sourceKey,
      walletId: parentIsPending
        ? null
        : (saleTransaction?.wallet_id ?? defaults.walletId),
    });
  } catch (error) {
    return {
      booked: false,
      reason: error instanceof Error ? error.message : 'unexpected-error',
      status: 'error',
    };
  }
}
