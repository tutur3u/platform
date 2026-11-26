'use client';
import { useEffect, useState } from 'react';
import {
  acquireTabDeviceId,
  CLAIM_RENEW_MS,
  releaseTabDeviceClaim,
  renewTabDeviceClaim,
  type TabDeviceClaim,
  tabDeviceKey,
} from '../lib/tab-device-id';

/** Claims held by this page load, so a repeated render reuses one id. */
const pageClaims = new Map<string, TabDeviceClaim>();

/**
 * This tab's device id for the meeting and account. A reload keeps it; a new
 * or duplicated tab gets its own. The claim is renewed while the page lives
 * and dropped when it is hidden for unload or the call unmounts.
 */
export function useTabDeviceId(meetingId: string, accountId?: string | null) {
  const key = tabDeviceKey(meetingId, accountId);
  const [claim] = useState(() => {
    const held = pageClaims.get(key);
    if (held) return held;
    const acquired = acquireTabDeviceId(key);
    pageClaims.set(key, acquired);
    return acquired;
  });
  useEffect(() => {
    pageClaims.set(key, claim);
    renewTabDeviceClaim(claim);
    const timer = setInterval(
      () => renewTabDeviceClaim(claim),
      CLAIM_RENEW_MS
    );
    const hide = () => releaseTabDeviceClaim(claim);
    const show = () => renewTabDeviceClaim(claim);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
      releaseTabDeviceClaim(claim);
      if (pageClaims.get(key) === claim) pageClaims.delete(key);
    };
  }, [claim, key]);
  return claim.deviceId;
}
