'use client';

import { useSyncExternalStore } from 'react';

const QUERY =
  '(prefers-reduced-motion: reduce), (max-width: 1023px), (pointer: coarse), (update: slow)';
type Capabilities = Navigator & {
  deviceMemory?: number;
  connection?: EventTarget & { saveData?: boolean };
};

function snapshot() {
  const device = navigator as Capabilities;
  return (
    window.matchMedia(QUERY).matches ||
    device.hardwareConcurrency <= 4 ||
    (device.deviceMemory !== undefined && device.deviceMemory <= 4) ||
    device.connection?.saveData === true
  );
}
function subscribe(update: () => void) {
  const media = window.matchMedia(QUERY);
  const connection = (navigator as Capabilities).connection;
  media.addEventListener('change', update);
  connection?.addEventListener('change', update);
  return () => {
    media.removeEventListener('change', update);
    connection?.removeEventListener('change', update);
  };
}

/** Static on mobile, reduced-motion, data-saving and constrained devices. */
export function useStaticMarketingMotion() {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
