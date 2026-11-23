import { useEffect, useMemo, useState } from 'react';
import {
  createReceiveRecovery,
  type ReceiveStatus,
} from '../lib/receive-recovery';

/** Backoff-driven subscriber rebuilds plus the quiet status they expose. */
export function useReceiveRecovery(resetSubscriber: () => void) {
  const [receiveStatus, setReceiveStatus] = useState<ReceiveStatus>('ok');
  const receiveRecovery = useMemo(
    () =>
      createReceiveRecovery({
        rebuild: () => {
          console.warn('Meet receiving media stalled; rebuilding subscriber');
          resetSubscriber();
        },
        onStatus: setReceiveStatus,
      }),
    [resetSubscriber]
  );
  useEffect(() => {
    window.addEventListener('online', receiveRecovery.retryNow);
    return () => window.removeEventListener('online', receiveRecovery.retryNow);
  }, [receiveRecovery]);
  return { receiveRecovery, receiveStatus };
}
