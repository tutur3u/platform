'use client';

import { useTimeZone } from 'next-intl';
import { getBrowserTimezone } from '@tuturuuu/utils/timezone';
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** Keep hydration stable, then show dates in the viewer's browser zone. */
export function useMailTimeZone() {
  const serverZone = useTimeZone();
  return useSyncExternalStore(
    subscribe,
    getBrowserTimezone,
    () => serverZone ?? 'UTC'
  );
}
