import type { MeetRealtimeTrackKind } from '@tuturuuu/realtime/meet';
import { useCallback, useEffect, useRef } from 'react';
import type { CallState } from './call-state';
import type { StageVideoWindow } from './room-actions';

export type BandwidthMode = 'auto' | 'saver' | 'quality';
type Audience = {
  participants?: number;
  visibleTiles?: number;
  spotlight?: boolean;
};
type Network = {
  available: number | null;
  rtt: number | null;
  loss: number | null;
};
// RIDs sort from highest to lowest quality so the SFU's ASCII-ordered
// fallback steps down one layer at a time (see `MEET_CAMERA_RIDS`).
const CAMERA_LAYERS = [
  { rid: 'f', scale: 1, share: 0.65 },
  { rid: 'h', scale: 2, share: 0.25 },
  { rid: 'q', scale: 4, share: 0.1 },
];

export function encodingBudget(
  kind: string,
  mode: BandwidthMode,
  available: number | null,
  roundTripMs: number | null,
  { participants = 0, visibleTiles = 0, spotlight = false }: Audience = {},
  packetLoss?: number | null
): RTCRtpEncodingParameters {
  if (kind === 'audio' || kind === 'screen_audio')
    return { maxBitrate: kind === 'audio' ? 48000 : 96000 };
  const constrained =
    mode === 'saver' ||
    (available !== null && available < 650000) ||
    (roundTripMs !== null && roundTripMs > 500) ||
    (packetLoss != null && packetLoss >= 0.05);
  if (kind === 'screen')
    return {
      maxBitrate: constrained ? 600000 : 1800000,
      maxFramerate: constrained ? 8 : 15,
      scaleResolutionDownBy: 1,
    };
  const dense = !spotlight && (participants >= 35 || visibleTiles >= 9);
  return {
    maxBitrate: constrained
      ? 260000
      : dense
        ? participants >= 50
          ? 440000
          : 550000
        : !spotlight && participants >= 15
          ? 650000
          : mode === 'quality' || spotlight
            ? 1400000
            : 900000,
    maxFramerate: constrained ? 15 : dense ? 18 : 24,
    scaleResolutionDownBy: constrained || dense ? 2 : 1,
  };
}

export function initialSendEncodings(
  kind: MeetRealtimeTrackKind,
  participants: number,
  simulcast = true
) {
  const budget = encodingBudget(kind, 'auto', null, null, { participants });
  if (kind !== 'video' || !simulcast) return [budget];
  return CAMERA_LAYERS.map(({ rid, scale, share }) => ({
    ...budget,
    rid,
    scaleResolutionDownBy: scale,
    maxBitrate: Math.round((budget.maxBitrate ?? 900000) * share),
  }));
}

export function planSenderEncodings(
  kind: MeetRealtimeTrackKind,
  mode: BandwidthMode,
  network: Network,
  audience: Audience,
  hasAudience: boolean,
  encodings: RTCRtpEncodingParameters[],
  videoSenders = 1,
  recovering = false
) {
  const budget = encodingBudget(
    kind,
    mode,
    network.available,
    network.rtt,
    audience,
    network.loss
  );
  const visual = kind === 'video' || kind === 'screen';
  const availableShare =
    visual && network.available !== null
      ? Math.max(
          0,
          Math.floor(((network.available - 144000) * 0.8) / videoSenders)
        )
      : Infinity;
  const maxBitrate = Math.min(budget.maxBitrate ?? Infinity, availableShare);
  const severe =
    maxBitrate <
      (kind === 'video' && (audience.participants ?? 0) >= 50
        ? 95000
        : 32000) ||
    (kind === 'video' &&
      ((network.loss ?? 0) >= 0.14 || (network.rtt ?? 0) >= 1000));
  return encodings.map((encoding) => {
    const layer =
      kind === 'video' && encodings.length > 1
        ? CAMERA_LAYERS.find(({ rid }) => rid === encoding.rid)
        : undefined;
    const cheap = mode === 'saver' || maxBitrate < 360000;
    return {
      ...encoding,
      ...budget,
      ...(visual
        ? {
            maxBitrate: Math.max(
              1,
              Math.floor(maxBitrate * (layer?.share ?? 1))
            ),
            ...(layer ? { scaleResolutionDownBy: layer.scale } : {}),
          }
        : {}),
      active:
        hasAudience &&
        (!visual || (!severe && !(kind === 'video' && recovering))) &&
        !(layer?.rid === 'f' && cheap),
    };
  });
}

/** Change sender limits in-place so speech continues during video suspension. */
export function watchSenderBandwidth({
  readPeer,
  readSenders,
  mode,
  hasAudience,
  audience = () => ({}),
}: {
  readPeer: () => RTCPeerConnection | null;
  readSenders: () => Map<string, RTCRtpSender>;
  mode: () => BandwidthMode;
  hasAudience: () => boolean;
  audience?: () => Audience;
}) {
  let active = true;
  let running = false;
  let suspended = false;
  let constrained = false;
  let healthy = 0;
  let recoverySamples = 0;
  let previousPeer: RTCPeerConnection | null = null;
  const applied = new WeakMap<RTCRtpSender, string>();
  const update = async () => {
    if (running || !active) return;
    const pc = readPeer();
    if (pc?.connectionState !== 'connected' || pc.signalingState !== 'stable')
      return;
    if (previousPeer !== pc) {
      previousPeer = pc;
      suspended = false;
      recoverySamples = 0;
      constrained = false;
      healthy = 0;
    }
    running = true;
    try {
      const network: Network = { available: null, rtt: null, loss: null };
      for (const stat of (await pc.getStats()).values()) {
        if (
          stat.type === 'candidate-pair' &&
          stat.state === 'succeeded' &&
          (stat.nominated || stat.selected)
        ) {
          if (
            Number.isFinite(stat.availableOutgoingBitrate) &&
            stat.availableOutgoingBitrate >= 0
          )
            network.available = stat.availableOutgoingBitrate;
          if (
            Number.isFinite(stat.currentRoundTripTime) &&
            stat.currentRoundTripTime >= 0
          )
            network.rtt = stat.currentRoundTripTime * 1000;
        }
        if (
          stat.type === 'remote-inbound-rtp' &&
          Number.isFinite(stat.fractionLost) &&
          stat.fractionLost >= 0 &&
          stat.fractionLost <= 1
        )
          network.loss = Math.max(network.loss ?? 0, stat.fractionLost);
      }
      const senders = [...readSenders().entries()];
      const videos = Math.max(
        1,
        senders.filter(([, sender]) => sender.track?.kind === 'video').length
      );
      const room = audience();
      if (
        (network.available !== null && network.available < 650000) ||
        (network.rtt !== null && network.rtt > 500) ||
        (network.loss ?? 0) >= 0.05
      ) {
        constrained = true;
        healthy = 0;
      } else if (Object.values(network).some((value) => value !== null)) {
        if (++healthy >= 4) constrained = false;
      } else healthy = 0;
      const currentMode = constrained ? 'saver' : mode();
      const cameraActive = planSenderEncodings(
        'video',
        currentMode,
        network,
        room,
        true,
        [{}],
        videos
      )[0]?.active;
      if (!cameraActive) {
        suspended = true;
        recoverySamples = 0;
      } else if (
        suspended &&
        Object.values(network).some((value) => value !== null)
      ) {
        if (++recoverySamples >= 3) suspended = false;
      }
      for (const [name, sender] of senders) {
        if (!active || readPeer() !== pc) break;
        if (!sender.track) continue;
        const kind = name.endsWith('-screen_audio')
          ? 'screen_audio'
          : name === 'screen' || name.endsWith('-screen')
            ? 'screen'
            : sender.track.kind === 'audio'
              ? 'audio'
              : 'video';
        const parameters = sender.getParameters();
        if (!parameters.encodings?.length) continue;
        const target = planSenderEncodings(
          kind,
          currentMode,
          network,
          room,
          hasAudience(),
          parameters.encodings,
          videos,
          suspended
        );
        const signature = JSON.stringify(target);
        if (applied.get(sender) === signature) continue;
        parameters.encodings = target;
        try {
          await sender.setParameters(parameters);
          applied.set(sender, signature);
        } catch {
          // Unsupported browser controls leave the existing sender running.
        }
      }
    } catch {
      // Transient stats errors leave the existing sender running.
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void update(), 3000);
  void update();
  return {
    refresh: () => void update(),
    dispose: () => {
      active = false;
      clearInterval(timer);
    },
  };
}

export function useAdaptiveSenderBandwidth({
  peer,
  senders,
  state,
  stage,
}: {
  peer: { current: RTCPeerConnection | null };
  senders: { current: Map<string, RTCRtpSender> };
  state: { current: CallState };
  stage: { current: StageVideoWindow | null };
}) {
  const mode = useRef<BandwidthMode>('auto');
  const refresh = useRef<() => void>(() => undefined);
  useEffect(() => {
    const watcher = watchSenderBandwidth({
      readPeer: () => peer.current,
      readSenders: () => senders.current,
      mode: () => mode.current,
      hasAudience: () => Object.keys(state.current.participants).length > 1,
      audience: () => ({
        participants: Object.keys(state.current.participants).length,
        visibleTiles: stage.current?.cameraUserIds.length,
        spotlight:
          !!state.current.selfUserId &&
          stage.current?.spotlightUserId === state.current.selfUserId,
      }),
    });
    refresh.current = watcher.refresh;
    return watcher.dispose;
  }, [peer, senders, stage, state]);
  const setBandwidthMode = useCallback((next: BandwidthMode) => {
    mode.current = next;
    refresh.current();
  }, []);
  return { setBandwidthMode, getBandwidthMode: () => mode.current };
}

export function addLocalTransceiver(
  pc: RTCPeerConnection,
  source: MediaStreamTrack,
  kind: MeetRealtimeTrackKind,
  count: number
) {
  try {
    return pc.addTransceiver(source, {
      direction: 'sendonly',
      sendEncodings: initialSendEncodings(kind, count),
    });
  } catch (error) {
    if (kind !== 'video') throw error;
    return pc.addTransceiver(source, {
      direction: 'sendonly',
      sendEncodings: initialSendEncodings(kind, count, false),
    });
  }
}
