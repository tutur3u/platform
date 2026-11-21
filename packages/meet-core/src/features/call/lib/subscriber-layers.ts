import {
  type MeetRealtimeRoomTrack,
  type MeetVideoLayer,
  simulcastPreference,
} from '@tuturuuu/realtime/meet';
import { useEffect } from 'react';
import {
  initialReceiverGovernor,
  layerForTile,
  nextReceiverGovernor,
  planLayerChanges,
  RECEIVER_SAMPLE_MS,
  type ReceiverGovernor,
  type ReceiverSample,
} from './layer-policy';
import { readMeetMediaFlags } from './media-flags';
import type { RemoteTrackOwner } from './remote-playback';
import type { StageVideoWindow } from './room-actions';
import type { SfuTracksResponse } from './sfu-response';
import type { MeetSignaling } from './signaling';

type Ref<T> = { current: T };
type Counters = {
  lost: number;
  received: number;
  freezes: number;
  bytes: number;
};

/** Aggregate inbound camera health across one stats interval. */
export function sampleReceiver(
  stats: RTCStatsReport,
  videoMids: ReadonlySet<string>,
  previous: Map<string, Counters>,
  elapsedMs: number
): ReceiverSample {
  let lost = 0;
  let received = 0;
  let freezes = 0;
  let bytes = 0;
  let rttMs: number | null = null;
  let availableKbps: number | null = null;
  const finite = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : null;
  const seen = new Set<string>();
  for (const stat of stats.values()) {
    if (
      stat.type === 'candidate-pair' &&
      stat.state === 'succeeded' &&
      (stat.nominated || stat.selected)
    ) {
      const rtt = finite(stat.currentRoundTripTime);
      if (rtt !== null) rttMs = rtt * 1000;
      const available = finite(stat.availableIncomingBitrate);
      if (available !== null) availableKbps = available / 1000;
    }
    if (
      stat.type !== 'inbound-rtp' ||
      stat.kind !== 'video' ||
      !videoMids.has(stat.mid)
    )
      continue;
    seen.add(stat.id);
    const now: Counters = {
      lost: finite(stat.packetsLost) ?? 0,
      received: finite(stat.packetsReceived) ?? 0,
      freezes: finite(stat.freezeCount) ?? 0,
      bytes: finite(stat.bytesReceived) ?? 0,
    };
    const before = previous.get(stat.id);
    previous.set(stat.id, now);
    if (!before) continue;
    lost += Math.max(0, now.lost - before.lost);
    received += Math.max(0, now.received - before.received);
    freezes += Math.max(0, now.freezes - before.freezes);
    bytes += Math.max(0, now.bytes - before.bytes);
  }
  for (const id of previous.keys()) if (!seen.has(id)) previous.delete(id);
  const packets = lost + received;
  return {
    loss: packets > 0 ? lost / packets : null,
    freezes,
    rttMs,
    availableKbps,
    receivedKbps: elapsedMs > 0 && packets > 0 ? (bytes * 8) / elapsedMs : null,
  };
}

/**
 * Keep each subscribed camera on the smallest simulcast layer its tile
 * needs, capped by the receiver's congestion ceiling. Layer switches use
 * the SFU's track update, which needs no renegotiation.
 */
export function useSubscriberLayers({
  active,
  peer,
  sessionRef,
  owners,
  state,
  requestedLayers,
  stageWindow,
  signalingRef,
}: {
  active: boolean;
  peer: Ref<RTCPeerConnection | null>;
  sessionRef: Ref<string | null>;
  owners: Ref<Map<string, RemoteTrackOwner>>;
  state: Ref<{ remoteTracks: Record<string, MeetRealtimeRoomTrack> }>;
  requestedLayers: Ref<Map<string, MeetVideoLayer>>;
  stageWindow: Ref<StageVideoWindow | null>;
  signalingRef: Ref<MeetSignaling | null>;
}) {
  useEffect(() => {
    if (!active || !readMeetMediaFlags().layerSwitching) return;
    let governor: ReceiverGovernor = initialReceiverGovernor();
    let currentPeer: RTCPeerConnection | null = null;
    let lastSampleAt = 0;
    let running = false;
    let pausedUntil = 0;
    const counters = new Map<string, Counters>();
    const pendingUpgrades = new Map<string, number>();
    const tick = async () => {
      const pc = peer.current;
      const sessionId = sessionRef.current;
      if (running || !pc || !sessionId || pc.connectionState !== 'connected')
        return;
      if (pc !== currentPeer) {
        currentPeer = pc;
        governor = initialReceiverGovernor();
        counters.clear();
        pendingUpgrades.clear();
      }
      running = true;
      try {
        const tracks = state.current.remoteTracks;
        const cameras = [...owners.current].flatMap(([mid, owner]) => {
          const publication = tracks[owner.subscriptionKey];
          return owner.kind === 'video' &&
            publication?.trackName &&
            (publication.cameraRids?.length ?? 0) > 1
            ? [{ mid, owner, publication }]
            : [];
        });
        const now = Date.now();
        const sample = sampleReceiver(
          await pc.getStats(),
          new Set(cameras.map(({ mid }) => mid)),
          counters,
          lastSampleAt ? now - lastSampleAt : 0
        );
        lastSampleAt = now;
        governor = nextReceiverGovernor(governor, sample, now);
        if (!cameras.length || now < pausedUntil) return;
        const window = stageWindow.current;
        const visibleTiles = window?.cameraUserIds.length ?? 0;
        const { changes, pending } = planLayerChanges(
          cameras.map(({ mid, owner }) => ({
            mid,
            userId: owner.userId,
            requested: requestedLayers.current.get(owner.subscriptionKey),
            pendingUpgrade: pendingUpgrades.get(mid),
          })),
          (userId) =>
            layerForTile({
              renderedPx: window?.tileHeights?.get(userId) ?? null,
              spotlight: userId === window?.spotlightUserId,
              visibleTiles,
              smallMode: window?.smallMode,
            }),
          governor.ceiling
        );
        pendingUpgrades.clear();
        for (const [mid, streak] of pending) pendingUpgrades.set(mid, streak);
        const updates = changes.flatMap(({ mid, layer }) => {
          const camera = cameras.find((entry) => entry.mid === mid)!;
          const simulcast = simulcastPreference(
            camera.publication.cameraRids,
            layer
          );
          return simulcast
            ? [
                {
                  layer,
                  key: camera.owner.subscriptionKey,
                  track: {
                    location: 'remote',
                    mid,
                    sessionId: camera.publication.sessionId,
                    trackName: camera.publication.trackName,
                    simulcast,
                  },
                },
              ]
            : [];
        });
        if (!updates.length) return;
        const batch = updates.slice(0, 64);
        let response: SfuTracksResponse | undefined;
        try {
          response = await signalingRef.current?.request<SfuTracksResponse>({
            type: 'sfu.tracks.update',
            sessionId,
            tracks: batch.map(({ track }) => track),
          });
        } catch {
          // A room server without layer updates, or a transient failure,
          // keeps the current layers; retry later rather than every tick.
          pausedUntil = Date.now() + 30_000;
          return;
        }
        if (peer.current !== pc || !response || response.errorCode) return;
        batch.forEach(({ key, layer, track }, index) => {
          const result =
            response.tracks?.find((entry) => entry.mid === track.mid) ??
            response.tracks?.[index];
          if (!result?.errorCode) requestedLayers.current.set(key, layer);
        });
      } catch {
        // Stats are best-effort; the next tick samples again.
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => void tick(), RECEIVER_SAMPLE_MS);
    return () => clearInterval(timer);
  }, [
    active,
    owners,
    peer,
    requestedLayers,
    sessionRef,
    signalingRef,
    stageWindow,
    state,
  ]);
}
