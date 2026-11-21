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
  isReceiverCongested,
  layerForTile,
  nextReceiverGovernor,
  planLayerChanges,
  RECEIVER_SAMPLE_MS,
  type ReceiverGovernor,
  type ReceiverSample,
} from './layer-policy';
import { readMeetMediaFlags } from './media-flags';
import {
  applyMediaPolicy,
  initialAudioOnly,
  type MediaPolicy,
  nextAudioOnly,
  startAudioOnly,
  type VisibilityPhase,
} from './media-policy';
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
  capabilities,
  ceilingRef,
  policy,
  queue,
  peer,
  resetSubscriber,
  sessionRef,
  owners,
  state,
  requestedLayers,
  stageWindow,
  signalingRef,
}: {
  active: boolean;
  /** Capabilities in effect, which a rejected request can narrow. */
  capabilities?: () => readonly string[] | undefined;
  /** Receives the receiver congestion ceiling for initial subscriptions. */
  ceilingRef?: Ref<MeetVideoLayer>;
  policy?: MediaPolicy;
  resetSubscriber: () => void;
  queue: Ref<Promise<void>>;
  peer: Ref<RTCPeerConnection | null>;
  sessionRef: Ref<string | null>;
  owners: Ref<Map<string, RemoteTrackOwner>>;
  state: Ref<{
    remoteTracks: Record<string, MeetRealtimeRoomTrack>;
    mediaCapabilities?: readonly string[];
    participants?: Record<string, unknown>;
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
    let audio = initialAudioOnly();
    let restoring = false;
    let lastPhase = policy?.getSnapshot().visibility;
    const counters = new Map<string, Counters>();
    const pendingUpgrades = new Map<string, number>();
    const readCapabilities =
      capabilities ?? (() => state.current.mediaCapabilities);
    // Set when the SFU demanded renegotiation for a layer update; holds until
    // the room server advertises capabilities again on a fresh join.
    let disabledFor: readonly string[] | undefined | null = null;
    const capable = () => {
      const advertised = readCapabilities();
      return (
        !!advertised?.includes('layer-update') && advertised !== disabledFor
      );
    };

    /** Revalidate and send planned layer changes; runs inside the queue. */
    const dispatch = async (
      pc: RTCPeerConnection,
      sessionId: string,
      planned: Map<string, { layer: MeetVideoLayer; key: string }>,
      phase: VisibilityPhase
    ) => {
      if (
        peer.current !== pc ||
        sessionRef.current !== sessionId ||
        // A plan made for another visibility phase is obsolete.
        (policy?.getSnapshot().visibility ?? 'visible') !== phase
      )
        return;
      const capabilities = readCapabilities();
      const updates = currentCameras(
        owners.current,
        state.current.remoteTracks
      ).flatMap(({ mid, owner, publication }) => {
        const plan = planned.get(mid);
        // The receiver must still carry the publication the plan was made for.
        if (!plan || plan.key !== owner.subscriptionKey) return [];
        const { layer } = plan;
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
        // Layer updates are documented as renegotiation-free. If the SFU
        // disagrees, rebuild the receiver rather than leave an offer pending
        // on a session other operations will reuse, and stop switching.
        disabledFor = readCapabilities();
        resetSubscriber();
        return;
      }
      for (const { key, layer, track } of batch) {
        const result = response.tracks?.find(
          (entry) => entry.mid === track.mid
        );
        if (
          result &&
          !result.errorCode &&
          owners.current.get(track.mid)?.subscriptionKey === key
        )
          requestedLayers.current.set(key, { layer, peer: pc });
      }
    };

    /** Camera readings stop counting once nothing is being sampled. */
    const idle = () => {
      lastSampleAt = 0;
      counters.clear();
      policy?.quality.recordReceiver(null, [], false);
    };
    // Every tick that does not record a measurement clears the reading, so
    // room reports never repeat a stale receive rate. The flag is per tick.
    const tick = async () => {
      if (busy) return;
      const result = { recorded: false };
      await step(result);
      if (!result.recorded) policy?.quality.recordReceiver(null, [], false);
    };
    const step = async (result: { recorded: boolean }) => {
      const now = Date.now();
      // The audio-only pause belongs to the link, not to any receiving peer:
      // its probe runs even while no receiver exists, because closing every
      // camera may leave nothing to subscribe to. A pause in the store
      // without a probe deadline gets one.
      if (policy?.getSnapshot().audioOnly && !audio.active)
        audio = startAudioOnly(audio, now);
      if (audio.active) {
        // A participant who resumes video manually starts a fresh probe.
        audio = policy?.getSnapshot().audioOnly
          ? nextAudioOnly(audio, null, now)
          : { ...initialAudioOnly(), probedAt: now };
        if (!audio.active) policy?.setAudioOnly(false);
        idle();
        return;
      }
      const pc = peer.current;
      const sessionId = sessionRef.current;
      if (!pc || !sessionId || pc.connectionState !== 'connected') return;
      if (pc !== currentPeer) {
        currentPeer = pc;
        // A rebuilt receiver inherits the link's ceiling and must earn any
        // upgrade with fresh healthy samples.
        governor = {
          ...initialReceiverGovernor(),
          ceiling: ceilingRef?.current ?? 'high',
        };
        counters.clear();
        pendingUpgrades.clear();
        pausedUntil = 0;
        lastSampleAt = 0;
      }
      if (!capable() || now < pausedUntil) return;
      const phase = policy?.getSnapshot().visibility ?? 'visible';
      if (phase === 'background') {
        idle();
        return;
      }
      const cameras = currentCameras(
        owners.current,
        state.current.remoteTracks
      );
      // No simulcast camera means nothing to switch and nothing to sample.
      if (!cameras.length) {
        idle();
        return;
      }
      busy = true;
      try {
        // A dimmed page only needs every camera on its lowest layer; it
        // spends no stats work on a view nobody is looking at.
        let sample: ReceiverSample | null = null;
        if (phase === 'visible') {
          const stats = await pc.getStats();
          // The receiver, session or policy may have changed while sampling;
          // a stale sample is discarded and the reading cleared.
          const liveCameras = currentCameras(
            owners.current,
            state.current.remoteTracks
          );
          if (
            peer.current !== pc ||
            sessionRef.current !== sessionId ||
            !capable() ||
            (policy?.getSnapshot().visibility ?? 'visible') !== 'visible' ||
            policy?.getSnapshot().audioOnly ||
            // A camera opened or closed meanwhile: the sample no longer
            // matches the receivers it would be attributed to.
            liveCameras.map(({ mid }) => mid).join() !==
              cameras.map(({ mid }) => mid).join()
          ) {
            idle();
            return;
          }
          sample = sampleReceiver(
            stats,
            new Set(cameras.map(({ mid }) => mid)),
            counters,
            lastSampleAt ? now - lastSampleAt : 0
          );
          lastSampleAt = now;
          governor = nextReceiverGovernor(governor, sample, now);
          if (ceilingRef) ceilingRef.current = governor.ceiling;
          // Severe congestion counts only once every camera is confirmed on
          // the lowest layer, not merely requested there.
          const confirmedLow = cameras.every(({ owner }) => {
            const confirmed = requestedLayers.current.get(
              owner.subscriptionKey
            );
            return confirmed?.peer === pc && confirmed.layer === 'low';
          });
          audio = nextAudioOnly(
            audio,
            {
              congested: isReceiverCongested(sample),
              ceiling: confirmedLow ? governor.ceiling : 'mid',
            },
            now
          );
          if (audio.active) {
            policy?.setAudioOnly(true);
            return;
          }
        } else {
          // Nothing is measured while dimmed: clear the reading now, before
          // any queued layer change, and restart the baseline so hidden-time
          // loss and freezes are never attributed to the next visible sample.
          idle();
          result.recorded = true;
        }
        const window = applyMediaPolicy(
          stageWindow.current,
          policy?.getSnapshot(),
          Object.keys(state.current.participants ?? {}).length,
          governor.ceiling === 'low'
        );
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
              // Returning to the page restores layers without hysteresis.
              pendingUpgrade: restoring ? 1 : pendingUpgrades.get(mid),
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
        restoring = false;
        // Layers are reported only alongside a fresh measurement.
        if (sample) {
          result.recorded = true;
          policy?.quality.recordReceiver(
            sample,
            cameras.flatMap(({ owner }) => {
              const confirmed = requestedLayers.current.get(
                owner.subscriptionKey
              );
              return confirmed?.peer === pc ? [confirmed.layer] : [];
            }),
            !!window?.smallMode
          );
        }
        pendingUpgrades.clear();
        for (const [mid, streak] of pending) pendingUpgrades.set(mid, streak);
        if (!changes.length) return;
        const keys = new Map(
          cameras.map(({ mid, owner }) => [mid, owner.subscriptionKey])
        );
        const planned = new Map(
          changes.map(({ mid, layer }) => [
            mid,
            { layer, key: keys.get(mid) ?? '' },
          ])
        );
        const run = queue.current.then(() =>
          dispatch(pc, sessionId, planned, phase)
        );
        queue.current = run.catch(() => undefined);
        await run;
      } catch {
        // Stats and updates are best-effort; the next tick samples again.
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void tick(), RECEIVER_SAMPLE_MS);
    const unsubscribe = policy?.subscribe(() => {
      const phase = policy.getSnapshot().visibility;
      if (phase === lastPhase) return;
      restoring ||= phase === 'visible';
      lastPhase = phase;
      void tick();
    });
    return () => {
      clearInterval(timer);
      unsubscribe?.();
    };
  }, [
    active,
    capabilities,
    ceilingRef,
    owners,
    peer,
    policy,
    queue,
    resetSubscriber,
    requestedLayers,
    sessionRef,
    signalingRef,
    stageWindow,
    state,
  ]);
}
