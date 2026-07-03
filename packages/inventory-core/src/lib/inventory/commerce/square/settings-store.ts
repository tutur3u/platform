import 'server-only';

import type {
  InventorySquareEnvironment,
  InventorySquareSettingsPayload,
} from '@tuturuuu/internal-api/inventory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

export type SupabaseErrorLike = { message?: string } | null;

export type SquareSettingsRow = {
  device_id: string | null;
  device_name: string | null;
  environment: InventorySquareEnvironment;
  location_id: string | null;
  location_name: string | null;
  sandbox_device_id: string | null;
};

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
  const privateAdmin = await getPrivateAdmin();
  const { error } = (await privateAdmin
    .from('inventory_square_settings' as never)
    .upsert(
      {
        device_id:
          payload.deviceId === undefined ? current.device_id : payload.deviceId,
        device_name:
          payload.deviceName === undefined
            ? current.device_name
            : payload.deviceName,
        environment: payload.environment ?? current.environment,
        location_id:
          payload.locationId === undefined
            ? current.location_id
            : payload.locationId,
        location_name:
          payload.locationName === undefined
            ? current.location_name
            : payload.locationName,
        sandbox_device_id:
          payload.sandboxDeviceId === undefined
            ? current.sandbox_device_id
            : payload.sandboxDeviceId,
        updated_at: new Date().toISOString(),
        updated_by: userId,
        ws_id: wsId,
      } as never,
      { onConflict: 'ws_id' }
    )) as { error: SupabaseErrorLike };

  if (error) throw new Error(error.message ?? 'Failed to save Square settings');
}
