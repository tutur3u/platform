import { useCallback } from 'react';
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
  return useCallback(async () => {
    if (session.current && peer.current)
      return { pc: peer.current, sessionId: session.current };
    const pc = new RTCPeerConnection(PEER_CONFIG);
    peer.current = pc;
    watchPeerRecovery(
      pc,
      () => peer.current === pc,
      () => reset(true)
    );
    return openPeerSession(pc, peer, session, signaling, reset);
  }, [peer, session, signaling, reset]);
}
