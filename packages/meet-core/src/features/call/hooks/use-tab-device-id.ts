'use client';
import { useEffect, useState } from 'react';
import {
  acquireTabDeviceId,
  CLAIM_RENEW_MS,
  confirmTabDeviceClaim,
  releaseTabDeviceClaim,
  renewTabDeviceClaim,
  type TabDeviceClaim,
  tabDeviceKey,
  throwawayTabDeviceClaim,
} from '../lib/tab-device-id';

/** Claims held by this browser page, so a repeated render reuses one id. */
const pageClaims = new Map<string, TabDeviceClaim>();

/** How many claims this page holds; the server render never adds one. */
export function heldTabDeviceClaims() {
  return pageClaims.size;
}

/**
 * This tab's device id for the meeting and account, or `null` until the page
 * has confirmed its claim. A reload keeps the id; a new or duplicated tab gets
 * its own. The claim is renewed while the page lives and dropped when it is
 * hidden for unload or the call unmounts.
 */
export function useTabDeviceId(meetingId: string, accountId?: string | null) {
  const key = tabDeviceKey(meetingId, accountId);
  const [claim, setClaim] = useState(() => {
    // The server render has no tab storage and must not keep per-request ids.
    if (typeof window === 'undefined') return throwawayTabDeviceClaim();
    const held = pageClaims.get(key);
    if (held) return held;
    const acquired = acquireTabDeviceId(key);
    pageClaims.set(key, acquired);
    return acquired;
  });
  const [confirmed, setConfirmed] = useState<string | null>(null);
  useEffect(() => {
    // Another page can overwrite the claim between acquiring and this check;
    // then this page takes a new id before it asks for a session.
    const current = confirmTabDeviceClaim(key, claim);
    if (current !== claim) {
      if (pageClaims.get(key) === claim) pageClaims.set(key, current);
      setClaim(current);
      return;
    }
    pageClaims.set(key, claim);
    setConfirmed(claim.nonce);
    const timer = setInterval(() => renewTabDeviceClaim(claim), CLAIM_RENEW_MS);
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
  return confirmed === claim.nonce ? claim.deviceId : null;
}
