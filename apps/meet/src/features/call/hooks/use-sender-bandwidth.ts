import { useCallback, useEffect, useRef } from 'react';
import { type BandwidthMode, watchSenderBandwidth } from '../lib/bandwidth';

export function useSenderBandwidth(
  peer: { current: RTCPeerConnection | null },
  senders: { current: Map<string, RTCRtpSender> },
  participantCount: number
) {
  const mode = useRef<BandwidthMode>('auto');
  const audience = useRef(participantCount);
  const refresh = useRef<() => void>(() => undefined);
  useEffect(() => {
    const budget = watchSenderBandwidth({
      readPeer: () => peer.current,
      readSenders: () => senders.current,
      mode: () => mode.current,
      hasAudience: () => audience.current > 1,
    });
    refresh.current = budget.refresh;
    return () => budget.dispose();
  }, [peer, senders]);
  useEffect(() => {
    audience.current = participantCount;
    refresh.current();
  }, [participantCount]);
  const setBandwidthMode = useCallback((next: BandwidthMode) => {
    mode.current = next;
    refresh.current();
  }, []);
  return { setBandwidthMode, getBandwidthMode: () => mode.current };
}
