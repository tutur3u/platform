import type {
  InventorySquareEnvironment,
  InventorySquareSettingsPayload,
} from '@tuturuuu/internal-api/inventory';

export type SquareSettingsRow = {
  device_id: string | null;
  device_name: string | null;
  environment: InventorySquareEnvironment;
  location_id: string | null;
  location_name: string | null;
  sandbox_device_id: string | null;
};

export function mergeSquareSettingsRow({
  current,
  payload,
}: {
  current: SquareSettingsRow;
  payload: InventorySquareSettingsPayload;
}): SquareSettingsRow {
  const environment = payload.environment ?? current.environment;
  const environmentChanged = environment !== current.environment;
  const keepForEnvironment = <T>(incoming: T | undefined, existing: T) =>
    incoming === undefined ? (environmentChanged ? null : existing) : incoming;

  return {
    device_id: keepForEnvironment(payload.deviceId, current.device_id),
    device_name: keepForEnvironment(payload.deviceName, current.device_name),
    environment,
    location_id: keepForEnvironment(payload.locationId, current.location_id),
    location_name: keepForEnvironment(
      payload.locationName,
      current.location_name
    ),
    sandbox_device_id:
      payload.sandboxDeviceId === undefined
        ? current.sandbox_device_id
        : payload.sandboxDeviceId,
  };
}
