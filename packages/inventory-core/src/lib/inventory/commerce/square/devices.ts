import 'server-only';

import type { TablesInsert } from '@tuturuuu/types/supabase';
import {
  createSquareDeviceCodeApi,
  createSquareIdempotencyKey,
  listSquareDevicesApi,
  listSquareLocationsApi,
  SquareApiError,
} from './client';
import { getInventorySquareAccessContext } from './connection-store';
import { getPrivateAdmin, loadSettingsRow } from './settings-store';
import type {
  SquareApiDevice,
  SquareApiDeviceCode,
  SquareApiLocation,
  SquareDevice,
  SquareDeviceCode,
  SquareEnvironment,
  SquareLocation,
} from './types';

type SquareDeviceCacheRecord = TablesInsert<
  { schema: 'private' },
  'inventory_square_devices'
>;

type SquareDeviceCacheError = {
  code?: string;
  message?: string;
} | null;

function mapLocation(location: SquareApiLocation): SquareLocation | null {
  if (!location.id) return null;
  return {
    country: location.country ?? null,
    currency: location.currency ?? null,
    id: location.id,
    name: location.name ?? location.id,
    status: location.status ?? null,
  };
}

function mapDevice(device: SquareApiDevice): SquareDevice | null {
  if (!device.id) return null;
  return {
    code: device.components?.terminal_details?.device_code_id ?? null,
    id: device.id,
    locationId: device.attributes?.location_id ?? null,
    name: device.attributes?.name ?? device.id,
    pairedAt: device.created_at ?? null,
    productType: device.attributes?.product_type ?? null,
    status: device.attributes?.status ?? null,
    updatedAt: device.updated_at ?? null,
  };
}

function mapDeviceCode(deviceCode: SquareApiDeviceCode): SquareDeviceCode {
  return {
    code: deviceCode.code ?? '',
    id: deviceCode.id ?? deviceCode.device_id ?? '',
    locationId: deviceCode.location_id ?? null,
    name: deviceCode.name ?? null,
    pairBy: deviceCode.pair_by ?? null,
    productType: deviceCode.product_type ?? null,
    status: deviceCode.status ?? null,
  };
}

async function persistSquareDeviceCache({
  deviceCodeId,
  deviceId,
  record,
}: {
  deviceCodeId?: string | null;
  deviceId?: string | null;
  record: SquareDeviceCacheRecord;
}) {
  const privateAdmin = await getPrivateAdmin();

  const updateExistingDeviceCode = async () => {
    if (!deviceCodeId) return false;

    const result = (await privateAdmin
      .from('inventory_square_devices' as never)
      .update(record as never)
      .eq('device_code_id', deviceCodeId)
      .select('id')
      .maybeSingle()) as {
      data: { id: string } | null;
      error: SquareDeviceCacheError;
    };

    if (result.error) {
      throw new Error(
        result.error.message ?? 'Failed to update Square device cache'
      );
    }

    return Boolean(result.data);
  };

  if (await updateExistingDeviceCode()) return;

  const { error } = (
    deviceId
      ? await privateAdmin
          .from('inventory_square_devices' as never)
          .upsert(record as never, {
            onConflict: 'ws_id,environment,device_id',
          })
      : await privateAdmin
          .from('inventory_square_devices' as never)
          .insert(record as never)
  ) as { error: SquareDeviceCacheError };

  if (!error) return;

  // Another request may have cached the same Square code after our first read.
  // Resolve that safe race without relying on the partial device_code_id index
  // as an ON CONFLICT target (PostgreSQL cannot infer it without its predicate).
  if (error.code === '23505' && (await updateExistingDeviceCode())) return;

  throw new Error(error.message ?? 'Failed to save Square device cache');
}

async function upsertDevice({
  device,
  environment,
  userId,
  wsId,
}: {
  device: SquareDevice;
  environment: SquareEnvironment;
  userId?: string | null;
  wsId: string;
}) {
  await persistSquareDeviceCache({
    deviceCodeId: device.code,
    deviceId: device.id,
    record: {
      device_code_id: device.code,
      device_id: device.id,
      device_name: device.name,
      environment,
      last_seen_at: device.updatedAt,
      location_id: device.locationId,
      metadata: {},
      paired_at: device.pairedAt,
      product_type: device.productType,
      status: device.status,
      updated_at: new Date().toISOString(),
      updated_by: userId ?? null,
      ws_id: wsId,
    },
  });
}

export async function listInventorySquareLocations(wsId: string) {
  const context = await getInventorySquareAccessContext(wsId);
  const locations = await listSquareLocationsApi(context);
  return locations.map(mapLocation).filter(Boolean) as SquareLocation[];
}

export async function listInventorySquareDevices(wsId: string) {
  const context = await getInventorySquareAccessContext(wsId);
  try {
    const devices = await listSquareDevicesApi(context);
    const mapped = devices.map(mapDevice).filter(Boolean) as SquareDevice[];
    await Promise.all(
      mapped.map((device) =>
        upsertDevice({
          device,
          environment: context.environment,
          wsId,
        })
      )
    );
    return mapped;
  } catch (error) {
    if (context.environment === 'sandbox' && error instanceof SquareApiError) {
      return [];
    }
    throw error;
  }
}

export async function createInventorySquareDeviceCode({
  locationId,
  name,
  userId,
  wsId,
}: {
  locationId?: string;
  name?: string;
  userId: string;
  wsId: string;
}) {
  const context = await getInventorySquareAccessContext(wsId);
  const settings = await loadSettingsRow(wsId);
  const resolvedLocationId = locationId || settings.location_id;
  if (!resolvedLocationId) throw new Error('Square location is not selected');
  const deviceCode = await createSquareDeviceCodeApi({
    ...context,
    idempotencyKey: createSquareIdempotencyKey('device'),
    locationId: resolvedLocationId,
    name: name || 'Tuturuuu Inventory Terminal',
  });
  if (!deviceCode) throw new Error('Square did not return a device code');

  const mapped = mapDeviceCode(deviceCode);
  await persistSquareDeviceCache({
    deviceCodeId: mapped.id,
    deviceId: deviceCode.device_id,
    record: {
      device_code_id: mapped.id,
      device_id: deviceCode.device_id ?? null,
      device_name: mapped.name,
      environment: context.environment,
      location_id: mapped.locationId,
      metadata: deviceCode as never,
      pairing_code: mapped.code,
      product_type: mapped.productType,
      status: mapped.status,
      updated_at: new Date().toISOString(),
      updated_by: userId,
      ws_id: wsId,
    },
  });
  return mapped;
}

export async function syncInventorySquareDeviceCodePaired({
  deviceCode,
  environment,
  wsId,
}: {
  deviceCode: SquareApiDeviceCode;
  environment: SquareEnvironment;
  wsId: string;
}) {
  const codeId = deviceCode.id;
  const deviceId = deviceCode.device_id;
  if (!codeId || !deviceId) return false;

  const mapped = mapDeviceCode(deviceCode);
  await persistSquareDeviceCache({
    deviceCodeId: codeId,
    deviceId,
    record: {
      device_code_id: codeId,
      device_id: deviceId,
      device_name: mapped.name,
      environment,
      last_seen_at: new Date().toISOString(),
      location_id: mapped.locationId,
      metadata: deviceCode as never,
      pairing_code: mapped.code || null,
      product_type: mapped.productType,
      status: mapped.status ?? 'PAIRED',
      updated_at: new Date().toISOString(),
      ws_id: wsId,
    },
  });
  return true;
}
