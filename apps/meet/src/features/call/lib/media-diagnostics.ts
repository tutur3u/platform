/** Only transport states and counters: never SDP, addresses, track IDs, or tokens. */
export async function readPeerDiagnostics(pc: RTCPeerConnection | null) {
  if (!pc)
    return {
      state: 'not_started' as const,
      roundTripMs: null as number | null,
      streams: [],
      tracks: [],
      statsUnavailable: false,
    };
  const state = pc.connectionState;
  const iceState = pc.iceConnectionState;
  const signalingState = pc.signalingState;
  try {
    const stats = await pc.getStats();
    let roundTripMs: number | null = null;
    for (const stat of stats.values()) {
      if (
        stat.type === 'candidate-pair' &&
        stat.state === 'succeeded' &&
        (stat.nominated || stat.selected) &&
        typeof stat.currentRoundTripTime === 'number' &&
        Number.isFinite(stat.currentRoundTripTime)
      )
        roundTripMs = Math.max(0, Math.round(stat.currentRoundTripTime * 1000));
    }
    const streams: Array<{
      direction: 'sent' | 'received';
      kind: 'audio' | 'video';
      packets: number;
      bytes: number;
      framesDecoded: number;
    }> = [];
    const number = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? value : 0;
    for (const stat of stats.values()) {
      if (stat.type !== 'outbound-rtp' && stat.type !== 'inbound-rtp') continue;
      if (stat.kind !== 'audio' && stat.kind !== 'video') continue;
      const sent = stat.type === 'outbound-rtp';
      streams.push({
        direction: sent ? 'sent' : 'received',
        kind: stat.kind,
        packets: number(sent ? stat.packetsSent : stat.packetsReceived),
        bytes: number(sent ? stat.bytesSent : stat.bytesReceived),
        framesDecoded: number(stat.framesDecoded),
      });
    }
    const tracks = pc.getReceivers().map(({ track }) => ({
      kind: track.kind,
      state: track.readyState,
      muted: track.muted,
      enabled: track.enabled,
    }));
    return {
      state,
      roundTripMs,
      iceState,
      signalingState,
      streams,
      tracks,
      statsUnavailable: false,
    };
  } catch {
    return {
      state,
      roundTripMs: null as number | null,
      iceState,
      signalingState,
      streams: [],
      tracks: [],
      statsUnavailable: true,
    };
  }
}

export type MediaDiagnostics = {
  signaling: string;
  attachedParticipants: number;
  publisher: Awaited<ReturnType<typeof readPeerDiagnostics>>;
  subscriber: Awaited<ReturnType<typeof readPeerDiagnostics>>;
};
