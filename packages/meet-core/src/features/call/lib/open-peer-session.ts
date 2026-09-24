import { configurePeerIce } from './peer-connection';
import type { SfuSessionResponse } from './sfu-response';
import type { MeetSignaling } from './signaling';

type Ref<T> = { current: T };
/** Failed or replaced session setup must never orphan a local peer. */
export async function openPeerSession(
  pc: RTCPeerConnection,
  peer: Ref<RTCPeerConnection | null>,
  session: Ref<string | null>,
  signaling: Ref<MeetSignaling | null>,
  reset: () => void
) {
  try {
    const result = await signaling.current?.request<SfuSessionResponse>({
      type: 'sfu.session.create',
    });
    if (!result?.sessionId) throw new Error('sfu_session_failed');
    if (peer.current !== pc) throw new Error('sfu_session_replaced');
    configurePeerIce(pc, result.iceServers);
    session.current = result.sessionId;
    return { pc, sessionId: result.sessionId };
  } catch (error) {
    if (peer.current === pc) reset();
    else pc.close();
    throw error;
  }
}
