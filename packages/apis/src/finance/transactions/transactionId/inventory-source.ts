import type { TypedSupabaseClient } from '@tuturuuu/supabase';

type InventorySourceRow = {
  checkout_session_id: string | null;
  currency: string;
  entry_kind:
    | 'sale'
    | 'refund'
    | 'chargeback_hold'
    | 'chargeback_release'
    | 'manual_provider_adjustment';
  id: string;
  provider: 'polar' | 'square_pos' | 'square_terminal';
  provider_reference_id: string | null;
};

export async function loadInventoryTransactionSource(
  sbAdmin: TypedSupabaseClient,
  transactionId: string,
  wsId: string
) {
  const privateSchema = sbAdmin.schema('private') as unknown as {
    from(table: 'inventory_finance_entries'): {
      select(columns: string): {
        eq(
          column: string,
          value: unknown
        ): {
          eq(
            column: string,
            value: unknown
          ): {
            maybeSingle(): PromiseLike<{
              data: InventorySourceRow | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
    };
  };
  const { data, error } = await privateSchema
    .from('inventory_finance_entries')
    .select(
      'id, checkout_session_id, provider, entry_kind, provider_reference_id, currency'
    )
    .eq('ws_id', wsId)
    .eq('wallet_transaction_id', transactionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const inventoryOrigin =
    process.env.NODE_ENV === 'production'
      ? 'https://inventory.tuturuuu.com'
      : 'https://inventory.tuturuuu.localhost';
  return {
    checkoutId: data.checkout_session_id,
    currency: data.currency,
    entryId: data.id,
    inventoryHref: data.checkout_session_id
      ? `${inventoryOrigin}/${wsId}/sales?checkoutId=${data.checkout_session_id}`
      : `${inventoryOrigin}/${wsId}/sales`,
    kind: data.entry_kind,
    provider: data.provider,
    providerReferenceId: data.provider_reference_id ?? data.id,
    reconciliationHref: `/${wsId}/transactions?reconciliation=${data.id}`,
    type: 'inventory' as const,
  };
}
