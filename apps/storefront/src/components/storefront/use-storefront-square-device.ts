'use client';

import type { InventorySquareDevice } from '@tuturuuu/internal-api/inventory';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  readSquareDevicePreference,
  resolveSquareDevicePreference,
  squareDevicePreferenceKey,
  writeSquareDevicePreference,
} from './square-device-preference';

export function useStorefrontSquareDevice({
  defaultDeviceId,
  devices,
  storeSlug,
}: {
  defaultDeviceId?: string | null;
  devices: InventorySquareDevice[];
  storeSlug: string;
}) {
  const [preferredDeviceId, setPreferredDeviceId] = useState('');

  useEffect(() => {
    setPreferredDeviceId(readSquareDevicePreference(storeSlug));
    const handleStorage = (event: StorageEvent) => {
      if (event.key === squareDevicePreferenceKey(storeSlug)) {
        setPreferredDeviceId(readSquareDevicePreference(storeSlug));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [storeSlug]);

  const selectedDeviceId = useMemo(
    () =>
      resolveSquareDevicePreference({
        defaultDeviceId,
        devices,
        preferredDeviceId,
      }),
    [defaultDeviceId, devices, preferredDeviceId]
  );
  const selectDevice = useCallback(
    (deviceId: string) => {
      setPreferredDeviceId(deviceId);
      writeSquareDevicePreference(storeSlug, deviceId);
    },
    [storeSlug]
  );

  return {
    isRemembered: Boolean(
      preferredDeviceId && preferredDeviceId === selectedDeviceId
    ),
    selectDevice,
    selectedDeviceId,
  };
}
