import type { InventorySquareDevice } from '@tuturuuu/internal-api/inventory';

export function squareDevicePreferenceKey(storeSlug: string) {
  return `storefront-pos-device:${storeSlug}`;
}

export function readSquareDevicePreference(storeSlug: string) {
  try {
    return localStorage.getItem(squareDevicePreferenceKey(storeSlug)) ?? '';
  } catch {
    return '';
  }
}

export function writeSquareDevicePreference(
  storeSlug: string,
  deviceId: string
) {
  try {
    localStorage.setItem(squareDevicePreferenceKey(storeSlug), deviceId);
  } catch {
    // Checkout remains usable when storage is unavailable or blocked.
  }
}

export function resolveSquareDevicePreference({
  defaultDeviceId,
  devices,
  preferredDeviceId,
}: {
  defaultDeviceId?: string | null;
  devices: InventorySquareDevice[];
  preferredDeviceId?: string | null;
}) {
  const availableIds = new Set(devices.map((device) => device.id));
  if (preferredDeviceId && availableIds.has(preferredDeviceId)) {
    return preferredDeviceId;
  }
  if (defaultDeviceId && availableIds.has(defaultDeviceId)) {
    return defaultDeviceId;
  }
  return '';
}
