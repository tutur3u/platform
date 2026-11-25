'use client';

import { useSyncExternalStore } from 'react';
import { useMeetCallUx } from '../prejoin/use-meet-call-ux';

const PHONE_QUERY = '(max-width: 639px)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia?.(PHONE_QUERY);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

const read = () => window.matchMedia?.(PHONE_QUERY).matches ?? false;

/** True below the `sm` breakpoint. */
export function usePhoneViewport() {
  return useSyncExternalStore(subscribe, read, () => false);
}

/**
 * True when the phone in-room layout applies: the redesigned flow is on and
 * the viewport is a phone. Everything the phone layout changes is local
 * presentation; none of it enters the synced stage layout.
 */
export function usePhoneChrome() {
  const enabled = useMeetCallUx();
  const phone = usePhoneViewport();
  return enabled && phone;
}
