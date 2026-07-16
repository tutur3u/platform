import 'server-only';

import type { InventorySquareSettingsPayload } from '@tuturuuu/internal-api/inventory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  mergeSquareSettingsRow,
  type SquareSettingsRow,
} from './settings-contract';

export {
  mergeSquareSettingsRow,
  type SquareSettingsRow,
} from './settings-contract';

export type SupabaseErrorLike = { message?: string } | null;

export async function getPrivateAdmin() {
  return (await createAdminClient()).schema('private');
}

export async function loadSettingsRow(
  wsId: string
): Promise<SquareSettingsRow> {
  const privateAdmin = await getPrivateAdmin();
  const result = (await privateAdmin
    .from('inventory_square_settings' as never)
    .select(
      'environment, location_id, location_name, device_id, device_name, sandbox_device_id'
    )
    .eq('ws_id', wsId)
    .maybeSingle()) as {
    data: SquareSettingsRow | null;
    error: SupabaseErrorLike;
  };

  if (result.error) {
    throw new Error(result.error.message ?? 'Failed to load Square settings');
  }

  return (
    result.data ?? {
      device_id: null,
      device_name: null,
      environment: 'sandbox',
      location_id: null,
      location_name: null,
      sandbox_device_id: null,
    }
  );
}

export async function upsertSettings({
  payload,
  userId,
  wsId,
}: {
  payload: InventorySquareSettingsPayload;
  userId: string | null;
  wsId: string;
}) {
  const current = await loadSettingsRow(wsId);
  const next = mergeSquareSettingsRow({ current, payload });
  const privateAdmin = await getPrivateAdmin();
  const { error } = (await privateAdmin
    .from('inventory_square_settings' as never)
    .upsert(
      {
        ...next,
        updated_at: new Date().toISOString(),
        updated_by: userId,
        ws_id: wsId,
      } as never,
      { onConflict: 'ws_id' }
    )) as { error: SupabaseErrorLike };

  if (error) throw new Error(error.message ?? 'Failed to save Square settings');
}
