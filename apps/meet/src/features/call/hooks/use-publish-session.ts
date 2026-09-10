import { useCallback, useEffect, useRef } from 'react';
import { openPeerSession } from '../lib/open-peer-session';
import { PEER_CONFIG } from '../lib/peer-connection';
import { watchPeerRecovery } from '../lib/peer-recovery';
import type { MeetSignaling } from '../lib/signaling';

type Ref<T> = { current: T };

export function usePublishSession(
  peer: Ref<RTCPeerConnection | null>,
  session: Ref<string | null>,
  signaling: Ref<MeetSignaling | null>,
  reset: (recover?: boolean) => void
) {
  const retry = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  return useCallback(async () => {
    clearTimeout(timer.current);
    if (session.current && peer.current)
      return { pc: peer.current, sessionId: session.current };
    const pc = new RTCPeerConnection(PEER_CONFIG);
    peer.current = pc;
    watchPeerRecovery(
      pc,
      () => peer.current === pc,
      () => reset(true)
    );
    const result = await openPeerSession(pc, peer, session, signaling, () => {
      reset();
      if (!active.current) return;
      const delay = Math.min(15000, 1500 * 2 ** Math.min(retry.current++, 4));
      timer.current = setTimeout(() => {
        if (!peer.current && !session.current) reset(true);
      }, delay);
    });
    retry.current = 0;
    return result;
  }, [peer, session, signaling, reset]);
}
