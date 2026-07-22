import type { InventorySquareDevice } from '@tuturuuu/internal-api/inventory';

const READY_DEVICE_STATUSES = new Set(['ONLINE', 'PAIRED', 'READY', 'SANDBOX']);

export function isSquareDeviceReady(status: string | null) {
  return status ? READY_DEVICE_STATUSES.has(status.toUpperCase()) : false;
}

export function getPosDeviceSummary(
  devices: InventorySquareDevice[],
  defaultDeviceId?: string | null,
  posAppReady = false
) {
  const readyTerminals = devices.filter((device) =>
    isSquareDeviceReady(device.status)
  ).length;
  return {
    configuredMethods: devices.length + (posAppReady ? 1 : 0),
    defaultDevice: devices.find((device) => device.id === defaultDeviceId),
    readyMethods: readyTerminals + (posAppReady ? 1 : 0),
    routableTerminals: devices.length,
  };
}
