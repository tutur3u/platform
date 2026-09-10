import { useCallback } from 'react';
import { configurePeerIce, PEER_CONFIG } from '../lib/peer-connection';
import { watchPeerRecovery } from '../lib/peer-recovery';
import type { SfuSessionResponse } from '../lib/sfu-response';
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
    const result = await signaling.current?.request<SfuSessionResponse>({
      type: 'sfu.session.create',
    });
    if (!result?.sessionId) throw new Error('sfu_session_failed');
    if (peer.current !== pc) throw new Error('sfu_session_replaced');
    configurePeerIce(pc, result.iceServers);
    session.current = result.sessionId;
    return { pc, sessionId: result.sessionId };
  }, [peer, session, signaling, reset]);
}
