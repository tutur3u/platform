import type {
  CloudflareSfuTrack,
  MeetRealtimeRoomTrack,
  MeetRealtimeTrackKind,
} from '@tuturuuu/realtime/meet';
import {
  MEET_MEDIA_CAPABILITIES,
  meetTrackKind,
  type MeetVideoLayer,
  negotiableCameraRids,
  simulcastPreference,
} from '@tuturuuu/realtime/meet';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { layerForTile, lowerLayer } from './layer-policy';
import { readMeetMediaFlags } from './media-flags';
import {
  applyMediaPolicy,
  type MediaPolicy,
  watchPageVisibility,
} from './media-policy';
import {
  recordSubscribedLayers,
  type RequestedLayer,
  useSubscriberLayers,
} from './subscriber-layers';
import type { RemoteMedia } from './remote-streams';
import { preparePeerSession } from './peer-connection';
import {
  applySubscribeResponse,
  pruneObsoleteReceivers,
} from './subscribe-response';
import {
  reconcileRemotePlayback,
  releaseClosedSubscriptions,
  type RemoteTrackOwner,
} from './remote-playback';
import type { SfuTracksResponse } from './sfu-response';
import type { MeetSignaling } from './signaling';
import type { CallState } from './call-state';
import type { StageVideoWindow } from './room-actions';
import { remoteTrackKey } from './call-state';

export interface LocalTrackPlan {
  kind: MeetRealtimeTrackKind;
  trackName: string;
}

/**
 * Track names have to be stable and unique per participant: the SFU addresses a
 * remote track by `{sessionId, trackName}`, so two people publishing "video"
 * would be indistinguishable without the owner baked in.
 */
export function localTrackName(userId: string, kind: MeetRealtimeTrackKind) {
  return `${userId}-${kind}`;
}

/**
 * Which of our tracks should currently be published, given what the user has
 * enabled. Screen share is a separate track from the camera so it can be
 * toggled without renegotiating the camera.
 */
export function planLocalTracks(
  userId: string,
  media: {
    audioEnabled: boolean;
    screenEnabled: boolean;
    videoEnabled: boolean;
  },
  screenHasAudio = false
): LocalTrackPlan[] {
  const plan: LocalTrackPlan[] = [];
  if (media.audioEnabled) {
    plan.push({ kind: 'audio', trackName: localTrackName(userId, 'audio') });
  }
  if (media.videoEnabled) {
    plan.push({ kind: 'video', trackName: localTrackName(userId, 'video') });
  }
  if (media.screenEnabled) {
    plan.push({ kind: 'screen', trackName: localTrackName(userId, 'screen') });
    if (screenHasAudio)
      plan.push({
        kind: 'screen_audio',
        trackName: localTrackName(userId, 'screen_audio'),
      });
  }
  return plan;
}

export interface TrackDiff {
  publish: LocalTrackPlan[];
  unpublish: LocalTrackPlan[];
}

/** What changed between the tracks we have published and the ones we want. */
export function diffLocalTracks(
  published: LocalTrackPlan[],
  desired: LocalTrackPlan[]
): TrackDiff {
  const publishedNames = new Set(published.map((track) => track.trackName));
  const desiredNames = new Set(desired.map((track) => track.trackName));

  return {
    publish: desired.filter((track) => !publishedNames.has(track.trackName)),
    unpublish: published.filter((track) => !desiredNames.has(track.trackName)),
  };
}

/**
 * Remote tracks we should pull but have not yet. Anything already subscribed,
 * or belonging to us, is skipped so a re-render never re-pulls the room.
 */
export function planRemoteSubscriptions(
  remoteTracks: Record<string, MeetRealtimeRoomTrack>,
  subscribedKeys: Iterable<string>,
  selfUserId: string | null
): CloudflareSfuTrack[] {
  const subscribed = new Set(subscribedKeys);
  const namesInBatch = new Set<string>();

  return (
    Object.values(remoteTracks)
      // Reconnecting publishers append their replacement session last.
      .reverse()
      .filter((track) => {
        if (track.userId === selfUserId) return false;
        if (!track.trackName) return false;
        if (namesInBatch.has(track.trackName)) return false;
        // Stable names include the publisher's user ID. Keep the newest session
        // authoritative even when subscribed, so a retry cannot restore its
        // stale predecessor. SFU responses may identify tracks only by name.
        namesInBatch.add(track.trackName);
        return !subscribed.has(remoteTrackKey(track));
      })
      .map((track) => ({
        location: 'remote',
        sessionId: track.sessionId,
        trackName: track.trackName,
      }))
  );
}

/** Subscriptions whose publisher has gone away. */
export function staleSubscriptions(
  remoteTracks: Record<string, MeetRealtimeRoomTrack>,
  subscribedKeys: Iterable<string>
) {
  return [...subscribedKeys].filter((key) => !(key in remoteTracks));
}

/**
 * Applies the workspace's video ceiling to a camera track. Cloudflare bills on
 * egress, so capping here is the difference between a predictable bill and an
 * open-ended one.
 */
export function videoConstraints(limits: {
  maxFrameRate: number;
  maxHeight: number;
  maxWidth: number;
}): MediaTrackConstraints {
  return {
    frameRate: { ideal: limits.maxFrameRate, max: limits.maxFrameRate },
    height: { ideal: limits.maxHeight, max: limits.maxHeight },
    width: { ideal: limits.maxWidth, max: limits.maxWidth },
  };
}

/**
 * Recovers the owner from a track name.
 *
 * Remote tracks arrive on the peer connection with an opaque id, so the only
 * way to attribute a stream to a participant is the name we chose when
 * publishing: `<userId>-<kind>`. Returns null for anything not in that shape.
 */
export function userIdFromTrackName(
  trackName: string | undefined
): string | null {
  if (!trackName) return null;
  const separator = trackName.lastIndexOf('-');
  if (separator <= 0) return null;

  const userId = trackName.slice(0, separator);
  const kind = trackName.slice(separator + 1);
  if (!['audio', 'video', 'screen', 'screen_audio'].includes(kind)) return null;

  return userId || null;
}

/** Resolve each publication from its owning capture, independent of microphone state. */
export function localTrackSource(
  kind: MeetRealtimeTrackKind,
  stream: MediaStream,
  screen: MediaStream | null
) {
  if (kind === 'screen') return screen?.getVideoTracks()[0];
  if (kind === 'screen_audio') return screen?.getAudioTracks()[0];
  return kind === 'audio'
    ? stream.getAudioTracks()[0]
    : stream.getVideoTracks()[0];
}

export function planWindowedRemoteSubscriptions({
  capabilities = MEET_MEDIA_CAPABILITIES,
  ceiling = 'high',
  remoteTracks,
  subscribedKeys,
  selfUserId,
  videoWindow,
}: {
  capabilities?: readonly string[];
  /** Receiver congestion ceiling; new subscriptions start at or below it. */
  ceiling?: MeetVideoLayer;
  remoteTracks: Record<string, MeetRealtimeRoomTrack>;
  subscribedKeys: Iterable<string>;
  selfUserId: string | null;
  videoWindow: StageVideoWindow | null;
}) {
  const visible = new Set(videoWindow?.cameraUserIds);
  const layers = new Map<string, MeetVideoLayer>();
  const wanted = Object.fromEntries(
    Object.entries(remoteTracks).filter(([, track]) => {
      const kind = meetTrackKind(track);
      if (kind === 'screen') return videoWindow?.screenVideo !== false;
      return kind !== 'video' || visible.has(track.userId);
    })
  );
  const pending = planRemoteSubscriptions(
    wanted,
    subscribedKeys,
    selfUserId
  ).map((track) => {
    const publication =
      wanted[
        remoteTrackKey({
          sessionId: track.sessionId ?? '',
          trackName: track.trackName,
          userId: '',
        })
      ];
    if (!publication) return track;
    const layer = lowerLayer(
      layerForTile({
        renderedPx: videoWindow?.tileHeights?.get(publication.userId) ?? null,
        spotlight: publication.userId === videoWindow?.spotlightUserId,
        visibleTiles: visible.size,
        smallMode: videoWindow?.smallMode,
      }),
      ceiling
    );
    const simulcast = simulcastPreference(
      negotiableCameraRids(publication.cameraRids, capabilities),
      layer
    );
    if (!simulcast) return track;
    layers.set(remoteTrackKey(publication), layer);
    return { ...track, simulcast } satisfies CloudflareSfuTrack;
  });
  return {
    layers,
    pending,
    close: [...subscribedKeys].filter(
      (key) => remoteTracks[key] && !wanted[key]
    ),
  };
}

export function orderStageTiles<
  T extends { key: string; userId: string; kind: 'camera' | 'screen' },
>(tiles: T[], focus: string | null, speakers: readonly string[]) {
  const rank = (tile: T) => {
    if (tile.key === focus) return -2;
    if (tile.kind === 'screen') return -1;
    const speaker = speakers.indexOf(tile.userId);
    return speaker < 0 ? Infinity : speaker;
  };
  return [...tiles].sort((left, right) => rank(left) - rank(right));
}

type Ref<T> = { current: T };

export function useWindowedSubscriber({
  activeRef,
  stateRef,
  admission,
  stageWindow,
  subscribeSessionRef,
  subscribePcRef,
  subscribedRef,
  trackOwnersRef,
  pendingSubscriptionsRef,
  subscribeQueue,
  ensureSubscribeSession,
  resetSubscriber,
  signalingRef,
  setRemoteMedia,
  policy,
}: {
  activeRef: Ref<boolean>;
  stateRef: Ref<CallState>;
  admission: CallState['admission'];
  stageWindow: Ref<StageVideoWindow | null>;
  subscribeSessionRef: Ref<string | null>;
  subscribePcRef: Ref<RTCPeerConnection | null>;
  subscribedRef: Ref<Set<string>>;
  trackOwnersRef: Ref<Map<string, RemoteTrackOwner>>;
  pendingSubscriptionsRef: Ref<Set<string>>;
  subscribeQueue: Ref<Promise<void>>;
  ensureSubscribeSession: () => Promise<{
    pc: RTCPeerConnection;
    sessionId: string;
  }>;
  resetSubscriber: () => void;
  signalingRef: Ref<MeetSignaling | null>;
  setRemoteMedia: Dispatch<SetStateAction<RemoteMedia>>;
  policy?: MediaPolicy;
}) {
  const requestedLayers = useRef(new Map<string, RequestedLayer>());
  // A room server that rejects current RIDs is treated as legacy until the
  // next join advertises capabilities again.
  const rejectedCapabilities = useRef<readonly string[] | null>(null);
  const ceilingRef = useRef<MeetVideoLayer>('high');
  const capabilities = useCallback(() => {
    const advertised = stateRef.current.mediaCapabilities;
    return advertised && advertised === rejectedCapabilities.current
      ? []
      : advertised;
  }, [stateRef]);
  useSubscriberLayers({
    active: admission === 'admitted',
    capabilities,
    ceilingRef,
    resetSubscriber,
    policy,
    queue: subscribeQueue,
    peer: subscribePcRef,
    sessionRef: subscribeSessionRef,
    owners: trackOwnersRef,
    state: stateRef,
    requestedLayers,
    stageWindow,
    signalingRef,
  });
  useEffect(() => {
    if (admission !== 'admitted') return;
    const pull = async () => {
      if (
        !activeRef.current ||
        Object.keys(stateRef.current.participants).length < 2
      )
        return;
      pruneObsoleteReceivers(
        stateRef.current.remoteTracks,
        trackOwnersRef.current,
        subscribedRef.current,
        setRemoteMedia
      );
      const nextWindow = stageWindow.current;
      if (!nextWindow || Date.now() - nextWindow.changedAt >= 700)
        settledWindow = nextWindow;
      // RIDs in this batch follow this advertisement; a newer one replans.
      const batchCapabilities = stateRef.current.mediaCapabilities;
      const { pending, close, layers } = planWindowedRemoteSubscriptions({
        capabilities: capabilities(),
        remoteTracks: stateRef.current.remoteTracks,
        subscribedKeys: subscribedRef.current,
        selfUserId: stateRef.current.selfUserId,
        videoWindow: applyMediaPolicy(
          settledWindow,
          policy?.getSnapshot(),
          Object.keys(stateRef.current.participants).length
        ),
        ceiling: ceilingRef.current,
      });
      const closing = new Set(close);
      const sessionId = subscribeSessionRef.current;
      const mids = [...trackOwnersRef.current]
        .filter(([, owner]) => closing.has(owner.subscriptionKey))
        .map(([mid]) => ({ mid }));
      if (mids.length && sessionId) {
        const peer = subscribePcRef.current;
        const response = await signalingRef.current?.request<SfuTracksResponse>(
          {
            type: 'sfu.tracks.close',
            subscription: true,
            sessionId,
            tracks: mids,
          }
        );
        if (peer !== subscribePcRef.current) return;
        if (
          !response ||
          response.errorCode ||
          response.tracks?.some((track) => track.errorCode)
        )
          throw new Error('sfu_subscription_close_failed');
        for (const key of closing) requestedLayers.current.delete(key);
        releaseClosedSubscriptions(
          closing,
          trackOwnersRef.current,
          subscribedRef.current,
          pendingSubscriptionsRef.current,
          setRemoteMedia
        );
      }
      // The SFU accepts up to 64 tracks per request. Continue with the next
      // batch after this offer completes.
      pending.splice(64);
      if (!pending.length) return;
      pendingSubscriptionsRef.current = new Set(
        pending.map(
          (track) =>
            `${encodeURIComponent(track.sessionId ?? '')}:${encodeURIComponent(track.trackName ?? '')}`
        )
      );
      let requestedPeer: RTCPeerConnection | null = null;
      try {
        const { pc, sessionId } = await ensureSubscribeSession();
        requestedPeer = pc;
        await preparePeerSession(
          pc,
          () => subscribePcRef.current === pc,
          resetSubscriber
        );
        if (subscribePcRef.current !== pc) return;
        // An older room server drops a request it cannot parse without a
        // correlated reply, so only this request timing out after asking for
        // current RIDs, under the same advertisement, marks a rollback.
        if (stateRef.current.mediaCapabilities !== batchCapabilities) return;
        const sentCapabilities = batchCapabilities;
        const answer = await signalingRef.current
          ?.request<SfuTracksResponse>({
            sessionId,
            tracks: pending,
            type: 'sfu.tracks.subscribe',
          })
          .catch((error: unknown) => {
            if (
              error instanceof Error &&
              (error as Error & { requestTimedOut?: boolean })
                .requestTimedOut === true &&
              sentCapabilities === stateRef.current.mediaCapabilities &&
              pending.some(
                ({ simulcast }) =>
                  simulcast?.preferredRid === 'f' ||
                  simulcast?.preferredRid === 'q'
              )
            )
              rejectedCapabilities.current = sentCapabilities ?? null;
            throw error;
          });
        if (subscribePcRef.current !== pc) return;
        recordSubscribedLayers(
          requestedLayers.current,
          layers,
          pending,
          answer,
          pc
        );
        applySubscribeResponse(
          answer,
          pending,
          stateRef.current.remoteTracks,
          trackOwnersRef.current,
          subscribedRef.current,
          setRemoteMedia
        );
        if (answer?.sessionDescription) {
          await pc.setRemoteDescription(answer.sessionDescription);
          if (subscribePcRef.current !== pc) return;
          const localAnswer = await pc.createAnswer();
          if (subscribePcRef.current !== pc) return;
          await pc.setLocalDescription(localAnswer);
          if (subscribePcRef.current !== pc) return;
          await signalingRef.current?.request({
            sessionDescription: { sdp: localAnswer.sdp ?? '', type: 'answer' },
            sessionId,
            type: 'sfu.renegotiate',
          });
        }
        if (subscribePcRef.current !== pc) return;
        reconcileRemotePlayback(
          pc,
          trackOwnersRef.current,
          subscribedRef.current,
          () => subscribePcRef.current === pc,
          setRemoteMedia
        );
      } catch (error) {
        if (requestedPeer && subscribePcRef.current === requestedPeer)
          resetSubscriber();
        throw error;
      } finally {
        pendingSubscriptionsRef.current.clear();
      }
    };
    let settledWindow: StageVideoWindow | null = null;
    let active = true;
    let scheduled = false,
      failures = 0,
      retryAfter = 0,
      // A policy change during a pull reconciles as soon as that pull ends.
      dirty = false;
    const schedule = (urgent = false) => {
      if (scheduled) {
        dirty ||= urgent;
        return;
      }
      if (!urgent && Date.now() < retryAfter) return;
      scheduled = true;
      dirty = false;
      subscribeQueue.current = subscribeQueue.current
        .then(async () => {
          if (active) await pull();
          failures = 0;
        })
        .catch((error) => {
          retryAfter =
            Date.now() + Math.min(15000, 1500 * 2 ** Math.min(failures++, 4));
          console.warn('Meet track subscription failed', error);
        })
        .finally(() => {
          scheduled = false;
          if (dirty && active) schedule(true);
        });
    };
    schedule();
    const retry = setInterval(() => schedule(), 1500);
    // Visibility and audio-only changes resubscribe at once, not on the timer.
    const unsubscribe = policy?.subscribe(() => {
      // Returning to the page uses the current stage, skipping the settle.
      if (policy.getSnapshot().visibility === 'visible')
        settledWindow = stageWindow.current;
      schedule(true);
    });
    const stopWatching =
      policy && readMeetMediaFlags().hiddenTabSaver
        ? watchPageVisibility(policy)
        : undefined;
    return () => {
      active = false;
      clearInterval(retry);
      unsubscribe?.();
      stopWatching?.();
      policy?.setVisibility('visible');
      if (stateRef.current.admission !== 'admitted') {
        subscribePcRef.current?.close();
        subscribePcRef.current = null;
        subscribeSessionRef.current = null;
        subscribedRef.current.clear();
      }
    };
  }, [
    activeRef,
    ensureSubscribeSession,
    pendingSubscriptionsRef,
    resetSubscriber,
    setRemoteMedia,
    signalingRef,
    stageWindow,
    stateRef,
    subscribePcRef,
    subscribeQueue,
    subscribeSessionRef,
    subscribedRef,
    trackOwnersRef,
    admission,
    capabilities,
    policy,
  ]);
}

export function useRecentSpeakers(
  active: boolean,
  peer: Ref<RTCPeerConnection | null>,
  owners: Ref<Map<string, RemoteTrackOwner>>,
  setState: Dispatch<SetStateAction<CallState>>
) {
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      // Speaker ordering only matters for a visible grid.
      if (typeof document !== 'undefined' && document.hidden) return;
      const speakers = (peer.current?.getTransceivers() ?? [])
        .flatMap(({ mid, receiver }) => {
          const owner = mid === null ? undefined : owners.current.get(mid);
          if (owner?.kind !== 'audio') return [];
          const loudest = Math.max(
            0,
            ...(receiver.getSynchronizationSources?.() ?? [])
              .filter((source) => performance.now() - source.timestamp < 1000)
              .map((source) => source.audioLevel ?? 0)
          );
          return loudest >= 0.05 ? [{ id: owner.userId, loudest }] : [];
        })
        .sort((a, b) => b.loudest - a.loudest)
        .slice(0, 4)
        .map(({ id }) => id);
      if (!speakers.length) return;
      setState((state) => {
        const recentSpeakerIds = [
          ...new Set([...speakers, ...(state.recentSpeakerIds ?? [])]),
        ].slice(0, 6);
        return recentSpeakerIds.join(',') === state.recentSpeakerIds?.join(',')
          ? state
          : { ...state, recentSpeakerIds };
      });
    }, 1200);
    return () => clearInterval(timer);
  }, [active, owners, peer, setState]);
}
