import 'server-only';

import {
  createSquareDeviceCodeApi,
  createSquareIdempotencyKey,
  listSquareDevicesApi,
  listSquareLocationsApi,
  SquareApiError,
} from './client';
import { getInventorySquareAccessContext } from './connection-store';
import {
  getPrivateAdmin,
  loadSettingsRow,
  type SupabaseErrorLike,
} from './settings-store';
import type {
  SquareApiDevice,
  SquareApiDeviceCode,
  SquareApiLocation,
  SquareDevice,
  SquareDeviceCode,
  SquareEnvironment,
  SquareLocation,
} from './types';

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
  const privateAdmin = await getPrivateAdmin();
  const { error } = (await privateAdmin
    .from('inventory_square_devices' as never)
    .upsert(
      {
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
      } as never,
      { onConflict: 'ws_id,environment,device_id' }
    )) as { error: SupabaseErrorLike };

  if (error) throw new Error(error.message ?? 'Failed to save Square device');
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
  const privateAdmin = await getPrivateAdmin();
  const { error } = (await privateAdmin
    .from('inventory_square_devices' as never)
    .upsert(
      {
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
      } as never,
      { onConflict: 'device_code_id' }
    )) as { error: SupabaseErrorLike };

  if (error) throw new Error(error.message ?? 'Failed to save device code');
  return mapped;
}
