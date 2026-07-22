import type { InventorySquareDevice } from '@tuturuuu/internal-api/inventory';

const READY_DEVICE_STATUSES = new Set(['ONLINE', 'PAIRED', 'READY', 'SANDBOX']);

export function isSquareDeviceReady(status: string | null) {
  return status ? READY_DEVICE_STATUSES.has(status.toUpperCase()) : false;
}

export function getPosDeviceSummary(
  devices: InventorySquareDevice[],
  defaultDeviceId?: string | null
) {
  return {
    defaultDevice: devices.find((device) => device.id === defaultDeviceId),
    ready: devices.filter((device) => isSquareDeviceReady(device.status))
      .length,
    total: devices.length,
  };
}
