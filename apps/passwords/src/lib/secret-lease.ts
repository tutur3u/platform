import { useCallback, useEffect, useRef, useState } from 'react';

export const SECRET_VISIBLE_MS = 60_000;

export interface SecretLease {
  itemId: string;
  name: string;
  bytes: Uint8Array;
  expiresAt: number;
}

/**
 * Holds one revealed secret for a fixed lifetime. Bytes are zeroed on expiry,
 * on release and on unmount. The value never enters a query cache, URL or
 * storage; `lease` is local component state only.
 */
export function useSecretLease(lifetimeMs: number = SECRET_VISIBLE_MS) {
  const [lease, setLease] = useState<SecretLease | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef<SecretLease | null>(null);

  const release = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    held.current?.bytes.fill(0);
    held.current = null;
    setLease(null);
  }, []);

  const hold = useCallback(
    (itemId: string, name: string, bytes: Uint8Array) => {
      release();
      const next = { itemId, name, bytes, expiresAt: Date.now() + lifetimeMs };
      held.current = next;
      timer.current = setTimeout(release, lifetimeMs);
      setLease(next);
    },
    [lifetimeMs, release]
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      held.current?.bytes.fill(0);
    },
    []
  );

  return { lease, hold, release };
}
