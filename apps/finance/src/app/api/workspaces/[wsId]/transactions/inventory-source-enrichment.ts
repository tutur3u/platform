import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { InventoryTransactionSource } from '@tuturuuu/types/primitives';

type SourceRow = {
  checkout_session_id: string | null;
  entry_kind: InventoryTransactionSource['kind'];
  id: string;
  provider: InventoryTransactionSource['provider'];
  provider_reference_id: string | null;
  wallet_transaction_id: string;
};

type SourceQuery = PromiseLike<{
  data: SourceRow[] | null;
  error: { message?: string } | null;
}> & {
  eq(column: string, value: unknown): SourceQuery;
  in(column: string, values: string[]): SourceQuery;
  select(columns: string): SourceQuery;
};

function sourceQuery(sbAdmin: TypedSupabaseClient) {
  return sbAdmin.schema('private') as unknown as {
    from(table: 'inventory_finance_entries'): SourceQuery;
  };
}

export async function loadInventoryTransactionSources({
  normalizedWsId,
  sbAdmin,
  transactionIds,
}: {
  normalizedWsId: string;
  sbAdmin: TypedSupabaseClient;
  transactionIds: string[];
}) {
  if (transactionIds.length === 0) {
    return new Map<string, InventoryTransactionSource>();
  }
  const { data, error } = await sourceQuery(sbAdmin)
    .from('inventory_finance_entries')
    .select(
      'id, checkout_session_id, provider, entry_kind, provider_reference_id, wallet_transaction_id'
    )
    .eq('ws_id', normalizedWsId)
    .in('wallet_transaction_id', transactionIds);
  if (error) throw error;
  const inventoryOrigin =
    process.env.NODE_ENV === 'production'
      ? 'https://inventory.tuturuuu.com'
      : 'https://inventory.tuturuuu.localhost';

  return new Map(
    (data ?? []).map((row) => [
      row.wallet_transaction_id,
      {
        checkoutId: row.checkout_session_id,
        entryId: row.id,
        inventoryHref: row.checkout_session_id
          ? `${inventoryOrigin}/${normalizedWsId}/sales?checkoutId=${row.checkout_session_id}`
          : `${inventoryOrigin}/${normalizedWsId}/sales`,
        kind: row.entry_kind,
        provider: row.provider,
        providerReferenceId: row.provider_reference_id ?? row.id,
        reconciliationHref: `/${normalizedWsId}/transactions?reconciliation=${row.id}`,
        type: 'inventory' as const,
      },
    ])
  );
}
