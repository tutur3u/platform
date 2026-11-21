import {
  type CloudflareSfuTrack,
  type MeetRealtimeRoomTrack,
  type MeetVideoLayer,
  negotiableCameraRids,
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
import { remoteTrackKey } from './call-state';
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

/** A layer the SFU confirmed for a subscription on one receiving peer. */
export type RequestedLayer = { layer: MeetVideoLayer; peer: RTCPeerConnection };

/** Record initial layers only for subscriptions the SFU explicitly accepted. */
export function recordSubscribedLayers(
  requested: Map<string, RequestedLayer>,
  layers: ReadonlyMap<string, MeetVideoLayer>,
  sent: readonly CloudflareSfuTrack[],
  answer: SfuTracksResponse | undefined,
  peer: RTCPeerConnection
) {
  if (!answer || answer.errorCode) return;
  for (const track of sent) {
    if (!track.simulcast) continue;
    const key = remoteTrackKey({
      sessionId: track.sessionId ?? '',
      trackName: track.trackName,
      userId: '',
    });
    const layer = layers.get(key);
    const result = answer.tracks?.find(
      (entry) => entry.trackName === track.trackName
    );
    if (layer && result?.mid && !result.errorCode)
      requested.set(key, { layer, peer });
  }
}

type Camera = {
  mid: string;
  owner: RemoteTrackOwner;
  publication: MeetRealtimeRoomTrack;
};

function currentCameras(
  owners: Map<string, RemoteTrackOwner>,
  tracks: Record<string, MeetRealtimeRoomTrack>
): Camera[] {
  return [...owners].flatMap(([mid, owner]) => {
    const publication = tracks[owner.subscriptionKey];
    return owner.kind === 'video' &&
      publication?.trackName &&
      (publication.cameraRids?.length ?? 0) > 1
      ? [{ mid, owner, publication }]
      : [];
  });
}

/**
 * Keep each subscribed camera on the smallest simulcast layer its tile
 * needs, capped by the receiver's congestion ceiling. Sampling runs on a
 * timer; every SFU change runs inside the subscriber queue so it can never
 * land between a subscription's offer and answer, and it is revalidated
 * against the live receiver right before it is sent.
 */
export function useSubscriberLayers({
  active,
  queue,
  peer,
  sessionRef,
  owners,
  state,
  requestedLayers,
  stageWindow,
  signalingRef,
}: {
  active: boolean;
  queue: Ref<Promise<void>>;
  peer: Ref<RTCPeerConnection | null>;
  sessionRef: Ref<string | null>;
  owners: Ref<Map<string, RemoteTrackOwner>>;
  state: Ref<{
    remoteTracks: Record<string, MeetRealtimeRoomTrack>;
    mediaCapabilities?: readonly string[];
  }>;
  requestedLayers: Ref<Map<string, RequestedLayer>>;
  stageWindow: Ref<StageVideoWindow | null>;
  signalingRef: Ref<MeetSignaling | null>;
}) {
  useEffect(() => {
    if (!active || !readMeetMediaFlags().layerSwitching) return;
    let governor: ReceiverGovernor = initialReceiverGovernor();
    let currentPeer: RTCPeerConnection | null = null;
    let lastSampleAt = 0;
    let busy = false;
    let pausedUntil = 0;
    const counters = new Map<string, Counters>();
    const pendingUpgrades = new Map<string, number>();
    const capable = () =>
      !!state.current.mediaCapabilities?.includes('layer-update');

    /** Revalidate and send planned layer changes; runs inside the queue. */
    const dispatch = async (
      pc: RTCPeerConnection,
      sessionId: string,
      planned: Map<string, MeetVideoLayer>
    ) => {
      if (peer.current !== pc || sessionRef.current !== sessionId) return;
      const capabilities = state.current.mediaCapabilities;
      const updates = currentCameras(
        owners.current,
        state.current.remoteTracks
      ).flatMap(({ mid, owner, publication }) => {
        const layer = planned.get(mid);
        if (!layer) return [];
        const simulcast = simulcastPreference(
          negotiableCameraRids(publication.cameraRids, capabilities),
          layer
        );
        return simulcast
          ? [
              {
                key: owner.subscriptionKey,
                layer,
                track: {
                  location: 'remote',
                  mid,
                  sessionId: publication.sessionId,
                  trackName: publication.trackName,
                  simulcast,
                } satisfies CloudflareSfuTrack,
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
        // Keep current layers and retry later rather than on every tick.
        pausedUntil = Date.now() + 30_000;
        return;
      }
      if (
        peer.current !== pc ||
        sessionRef.current !== sessionId ||
        !response ||
        response.errorCode
      )
        return;
      if (response.requiresImmediateRenegotiation) {
        // Layer updates are documented as renegotiation-free; if the SFU
        // disagrees, stop switching on this peer rather than desynchronise it.
        pausedUntil = Infinity;
        return;
      }
      for (const { key, layer, track } of batch) {
        // A reply without per-track results confirms the whole batch.
        const result = response.tracks
          ? response.tracks.find((entry) => entry.mid === track.mid)
          : {};
        if (result && !result.errorCode && owners.current.get(track.mid))
          requestedLayers.current.set(key, { layer, peer: pc });
      }
    };

    const tick = async () => {
      const pc = peer.current;
      const sessionId = sessionRef.current;
      if (busy || !pc || !sessionId || pc.connectionState !== 'connected')
        return;
      if (pc !== currentPeer) {
        currentPeer = pc;
        governor = initialReceiverGovernor();
        counters.clear();
        pendingUpgrades.clear();
        pausedUntil = 0;
        lastSampleAt = 0;
      }
      const now = Date.now();
      if (!capable() || now < pausedUntil) return;
      const cameras = currentCameras(
        owners.current,
        state.current.remoteTracks
      );
      // No simulcast camera means nothing to switch and nothing to sample.
      if (!cameras.length) {
        lastSampleAt = 0;
        counters.clear();
        return;
      }
      busy = true;
      try {
        const sample = sampleReceiver(
          await pc.getStats(),
          new Set(cameras.map(({ mid }) => mid)),
          counters,
          lastSampleAt ? now - lastSampleAt : 0
        );
        lastSampleAt = now;
        governor = nextReceiverGovernor(governor, sample, now);
        const window = stageWindow.current;
        const visibleTiles = window?.cameraUserIds.length ?? 0;
        const live = new Set(cameras.map(({ owner }) => owner.subscriptionKey));
        for (const key of requestedLayers.current.keys())
          if (!live.has(key)) requestedLayers.current.delete(key);
        const { changes, pending } = planLayerChanges(
          cameras.map(({ mid, owner }) => {
            const confirmed = requestedLayers.current.get(
              owner.subscriptionKey
            );
            return {
              mid,
              userId: owner.userId,
              requested: confirmed?.peer === pc ? confirmed.layer : undefined,
              pendingUpgrade: pendingUpgrades.get(mid),
            };
          }),
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
        if (!changes.length) return;
        const planned = new Map(changes.map(({ mid, layer }) => [mid, layer]));
        const run = queue.current.then(() => dispatch(pc, sessionId, planned));
        queue.current = run.catch(() => undefined);
        await run;
      } catch {
        // Stats and updates are best-effort; the next tick samples again.
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void tick(), RECEIVER_SAMPLE_MS);
    return () => clearInterval(timer);
  }, [
    active,
    owners,
    peer,
    queue,
    requestedLayers,
    sessionRef,
    signalingRef,
    stageWindow,
    state,
  ]);
}
