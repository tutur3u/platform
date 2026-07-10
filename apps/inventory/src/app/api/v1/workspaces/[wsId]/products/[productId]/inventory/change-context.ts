import type { InventoryStockChangeContext } from '@tuturuuu/internal-api/inventory';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types/supabase';

type ProductStockChangeInsert =
  Database['public']['Tables']['product_stock_changes']['Insert'] & {
    note?: string | null;
  };

export function normalizeStockChangeContext(
  context: InventoryStockChangeContext | undefined
) {
  return {
    beneficiaryId: context?.beneficiaryId ?? null,
    note: context?.note?.trim() || null,
  };
}

export function stockChangeContextColumns(
  context: ReturnType<typeof normalizeStockChangeContext>
) {
  return {
    beneficiary_id: context.beneficiaryId,
    note: context.note,
  };
}

export async function validateStockChangeBeneficiary({
  beneficiaryId,
  sbAdmin,
  wsId,
}: {
  beneficiaryId: string | null;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}): Promise<
  | { ok: true }
  | { error?: unknown; message: string; ok: false; status: 400 | 500 }
> {
  if (!beneficiaryId) return { ok: true };

  const { data, error } = await sbAdmin
    .from('workspace_users')
    .select('id')
    .eq('id', beneficiaryId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) {
    return {
      error,
      message: 'Error validating stock beneficiary',
      ok: false,
      status: 500,
    };
  }
  if (!data) {
    return {
      message: 'Invalid stock beneficiary',
      ok: false,
      status: 400,
    };
  }

  return { ok: true };
}

export function insertProductStockChanges(
  sbAdmin: TypedSupabaseClient,
  changes: ProductStockChangeInsert | ProductStockChangeInsert[]
) {
  // The Supabase package declaration can lag the freshly generated source
  // during an additive migration. Keep that compatibility cast at one boundary.
  return sbAdmin.from('product_stock_changes').insert(changes as never);
}
