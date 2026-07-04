import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';

export type ManufacturerIdResolution =
  | {
      ok: true;
      manufacturerId: string | null | undefined;
    }
  | {
      ok: false;
      message: string;
    };

export async function resolveProductManufacturerId({
  sbAdmin,
  wsId,
  manufacturerId,
  legacyManufacturerName,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  manufacturerId?: string | null;
  legacyManufacturerName?: string | null;
}): Promise<ManufacturerIdResolution> {
  const inventory = sbAdmin.schema('private');

  if (manufacturerId !== undefined) {
    if (manufacturerId === null || manufacturerId === '') {
      return { ok: true, manufacturerId: null };
    }

    const { data, error } = await inventory
      .from('inventory_manufacturers')
      .select('id')
      .eq('id', manufacturerId)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (error || !data) {
      return { ok: false, message: 'Invalid inventory manufacturer' };
    }

    return { ok: true, manufacturerId: data.id };
  }

  if (legacyManufacturerName === undefined) {
    return { ok: true, manufacturerId: undefined };
  }

  if (legacyManufacturerName === null) {
    return { ok: true, manufacturerId: null };
  }

  const normalizedName = legacyManufacturerName.trim();
  if (!normalizedName) {
    return { ok: true, manufacturerId: null };
  }

  if (normalizedName.length > MAX_NAME_LENGTH) {
    return { ok: false, message: 'Invalid inventory manufacturer' };
  }

  const { data, error } = await inventory
    .from('inventory_manufacturers')
    .upsert(
      {
        ws_id: wsId,
        name: normalizedName,
      },
      { onConflict: 'ws_id,name' }
    )
    .select('id')
    .single();

  if (error || !data) {
    return { ok: false, message: 'Failed to resolve inventory manufacturer' };
  }

  return { ok: true, manufacturerId: data.id };
}
