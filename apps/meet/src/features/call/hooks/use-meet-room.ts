'use client';

import { createMeetCallRealtimeToken } from '@tuturuuu/internal-api';
import type {
  CloudflareSfuTrack,
  MeetMediaState,
  MeetRealtimeTrackKind,
} from '@tuturuuu/realtime/meet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CallState,
  INITIAL_CALL_STATE,
  reduceCallState,
  remoteTrackKey,
} from '../lib/call-state';
import {
  CameraEffects,
  type CameraLook,
  DEFAULT_CAMERA_LOOK,
} from '../lib/camera-effects';
import { createLocalMediaControls } from '../lib/local-media-controls';
import { readPeerDiagnostics } from '../lib/media-diagnostics';
import { createRoomActions } from '../lib/room-actions';
import type {
  MeetRoomController,
  UseMeetRoomOptions,
} from '../lib/room-controller';

export type {
  MeetRoomController,
  UseMeetRoomOptions,
} from '../lib/room-controller';

import { applyForcedMute } from '../lib/forced-media';
import {
  diffLocalTracks,
  type LocalTrackPlan,
  localTrackSource,
  planLocalTracks,
  planRemoteSubscriptions,
  userIdFromTrackName,
} from '../lib/negotiation';
import {
  configurePeerIce,
  PEER_CONFIG,
  preparePeerSession,
  waitForPeerConnection,
} from '../lib/peer-connection';
import { watchPeerRecovery } from '../lib/peer-recovery';
import { assertPublishedResponse } from '../lib/publish-response';
import {
  closePublishedTrack,
  syncPublishedSenders,
} from '../lib/published-senders';
import { watchReceiverHealth } from '../lib/receiver-health';
import {
  listenRemotePlayback,
  type RemoteTrackOwner,
  reconcileRemotePlayback,
  releaseClosedSubscriptions,
} from '../lib/remote-playback';
import {
  createRemoteStreamCache,
  type RemoteMedia,
} from '../lib/remote-streams';
import type {
  SfuSessionResponse,
  SfuTracksResponse,
} from '../lib/sfu-response';
import { MeetSignaling, type MeetSignalingStatus } from '../lib/signaling';

/** One signaling socket and separate publishing/subscribing SFU connections. */
export function useMeetRoom({
  meetingId,
  realtimeUrl,
  token,
}: UseMeetRoomOptions): MeetRoomController {
  const effects = useMemo(() => new CameraEffects(), []);
  const [cameraLook, setCameraLookState] =
    useState<CameraLook>(DEFAULT_CAMERA_LOOK);
  const activeRef = useRef(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const [state, setState] = useState<CallState>(INITIAL_CALL_STATE);
  const [connectionStatus, setConnectionStatus] =
    useState<MeetSignalingStatus>('connecting');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteMedia, setRemoteMedia] = useState<RemoteMedia>({});
  const [connectionGeneration, setConnectionGeneration] = useState(0);
  const publishQueue = useRef(Promise.resolve());
  const subscribeQueue = useRef(Promise.resolve());
  const sendersRef = useRef(new Map<string, RTCRtpSender>());
  const [media, setMedia] = useState<MeetMediaState>({
    audioEnabled: false,
    screenEnabled: false,
    videoEnabled: false,
  });

  const signalingRef = useRef<MeetSignaling | null>(null);
  const publishPcRef = useRef<RTCPeerConnection | null>(null);
  const subscribePcRef = useRef<RTCPeerConnection | null>(null);
  const publishSessionRef = useRef<string | null>(null);
  const subscribeSessionRef = useRef<string | null>(null);
  const publishedRef = useRef<LocalTrackPlan[]>([]);
  const pendingSubscriptionsRef = useRef(new Set<string>());
  const subscribedRef = useRef<Set<string>>(new Set());
  const screenStreamRef = useRef<MediaStream | null>(null);
  /** mid -> owning participant, the only way to attribute an inbound track. */
  const trackOwnersRef = useRef<Map<string, RemoteTrackOwner>>(new Map());
  const stateRef = useRef(state);
  stateRef.current = state;

  const mediaRef = useRef(media);
  mediaRef.current = media;

  const syncForcedMediaRef = useRef<(next: MeetMediaState) => void>(() => {});

  const resetPublisher = useCallback((recover = false) => {
    publishPcRef.current?.close();
    publishPcRef.current = null;
    publishSessionRef.current = null;
    sendersRef.current.clear();
    publishedRef.current = [];
    if (recover) setConnectionGeneration((value) => value + 1);
  }, []);

  const lastReceiveRecovery = useRef(0);
  const resetSubscriber = useCallback(() => {
    subscribePcRef.current?.close();
    subscribePcRef.current = null;
    subscribeSessionRef.current = null;
    trackOwnersRef.current.clear();
    subscribedRef.current.clear();
    setRemoteMedia({});
  }, []);

  useEffect(() => {
    activeRef.current = true;
    let usedInitialToken = false;

    // Reconnects fetch fresh tokens because calls can outlast token expiry.
    const resolveUrl = async () => {
      if (!usedInitialToken) {
        usedInitialToken = true;
        return `${realtimeUrl}?token=${encodeURIComponent(token)}`;
      }

      // Reauthorize invite access on Meet, including guests outside the workspace.
      const refreshed = await createMeetCallRealtimeToken(meetingId);
      return `${refreshed.realtimeUrl}?token=${encodeURIComponent(refreshed.token)}`;
    };

    const signaling = new MeetSignaling({
      onMessage: (message) => {
        if (
          message.type === 'track.closed' &&
          releaseClosedSubscriptions(
            new Set(message.tracks.map(remoteTrackKey)),
            trackOwnersRef.current,
            subscribedRef.current,
            pendingSubscriptionsRef.current,
            setRemoteMedia
          )
        )
          resetSubscriber();
        if (message.type === 'participant.removed') {
          setRemoteMedia((current) => {
            const next = { ...current };
            delete next[message.userId];
            return next;
          });
        }
        if (
          message.type === 'participant.muted' &&
          message.userId === stateRef.current.selfUserId
        ) {
          const next = applyForcedMute(
            mediaRef.current,
            message.kinds,
            localStreamRef.current,
            screenStreamRef.current,
            () => effects.setEnabled(false)
          );
          if (message.kinds.includes('screen')) {
            setScreenStream(null);
            screenStreamRef.current = null;
          }
          mediaRef.current = next;
          setMedia(next);
          syncForcedMediaRef.current(next);
        }
        setState((current) => reduceCallState(current, message));
      },
      onReconnected: () => {
        // Re-announce and resubscribe on fresh media sessions.
        resetSubscriber();
        resetPublisher();
        setConnectionGeneration((value) => value + 1);

        signalingRef.current?.send({
          media: mediaRef.current,
          type: 'presence.join',
        });
      },
      onStatusChange: setConnectionStatus,
      resolveUrl,
    });
    signalingRef.current = signaling;
    signaling.connect();
    const heartbeat = setInterval(() => {
      signaling.send({ type: 'presence.update', media: mediaRef.current });
    }, 10_000);

    heartbeatRef.current = heartbeat;
    return () => {
      activeRef.current = false;
      effects.dispose();
      clearInterval(heartbeat);
      signaling.close();
      for (const track of localStreamRef.current?.getTracks() ?? [])
        track.stop();
      for (const track of screenStreamRef.current?.getTracks() ?? [])
        track.stop();
      localStreamRef.current = null;
      screenStreamRef.current = null;
      setLocalStream(null);
      setScreenStream(null);
      mediaRef.current = {
        audioEnabled: false,
        screenEnabled: false,
        videoEnabled: false,
      };
      setMedia(mediaRef.current);
      signalingRef.current = null;
      resetPublisher();
      subscribePcRef.current?.close();
      subscribePcRef.current = null;
      subscribeSessionRef.current = null;
      subscribedRef.current = new Set();
    };
  }, [effects, meetingId, realtimeUrl, resetPublisher, resetSubscriber, token]);

  const publishPresence = useCallback((next: MeetMediaState) => {
    signalingRef.current?.send({ media: next, type: 'presence.update' });
  }, []);

  const ensurePublishSession = useCallback(async () => {
    if (publishSessionRef.current && publishPcRef.current) {
      return {
        pc: publishPcRef.current,
        sessionId: publishSessionRef.current,
      };
    }

    const pc = new RTCPeerConnection(PEER_CONFIG);
    publishPcRef.current = pc;
    watchPeerRecovery(
      pc,
      () => publishPcRef.current === pc,
      () => resetPublisher(true)
    );
    const result = await signalingRef.current?.request<SfuSessionResponse>({
      type: 'sfu.session.create',
    });
    if (!result?.sessionId) throw new Error('sfu_session_failed');

    if (publishPcRef.current !== pc) throw new Error('sfu_session_replaced');
    configurePeerIce(pc, result.iceServers);
    publishSessionRef.current = result.sessionId;
    return { pc, sessionId: result.sessionId };
  }, [resetPublisher]);

  const ensureSubscribeSession = useCallback(async () => {
    if (subscribeSessionRef.current && subscribePcRef.current) {
      return {
        pc: subscribePcRef.current,
        sessionId: subscribeSessionRef.current,
      };
    }

    const pc = new RTCPeerConnection(PEER_CONFIG);
    subscribePcRef.current = pc;
    watchPeerRecovery(pc, () => subscribePcRef.current === pc, resetSubscriber);
    watchReceiverHealth(
      pc,
      trackOwnersRef.current,
      () => stateRef.current.participants,
      () => subscribePcRef.current === pc,
      () => {
        // A persistent network failure must not create a tight session churn loop.
        if (Date.now() - lastReceiveRecovery.current < 60_000) return;
        lastReceiveRecovery.current = Date.now();
        console.warn('Meet receiving media stalled; rebuilding subscriber');
        resetSubscriber();
      }
    );

    listenRemotePlayback(
      pc,
      trackOwnersRef.current,
      subscribedRef.current,
      () => subscribePcRef.current === pc,
      setRemoteMedia
    );
    const result = await signalingRef.current?.request<SfuSessionResponse>({
      type: 'sfu.session.create',
    });
    if (!result?.sessionId) throw new Error('sfu_session_failed');

    if (subscribePcRef.current !== pc) throw new Error('sfu_session_replaced');
    configurePeerIce(pc, result.iceServers);
    subscribeSessionRef.current = result.sessionId;
    return { pc, sessionId: result.sessionId };
  }, [resetSubscriber]);

  /** Pushes newly enabled local tracks to the SFU. */
  const syncLocalTracks = useCallback(
    async (stream: MediaStream, next: MeetMediaState) => {
      if (!activeRef.current) return;
      const selfUserId = stateRef.current.selfUserId;
      if (!selfUserId) return;

      const desired = planLocalTracks(
        selfUserId,
        next,
        screenStreamRef.current
          ?.getAudioTracks()
          .some((track) => track.readyState === 'live')
      );
      const previousPc = publishPcRef.current;
      const published = await syncPublishedSenders({
        published: publishedRef.current,
        desired,
        senders: sendersRef.current,
        pc: publishPcRef.current,
        sessionId: publishSessionRef.current,
        stream,
        screenStream: screenStreamRef.current,
        isCurrent: () => publishPcRef.current === previousPc,
        reset: () => resetPublisher(true),
        closeTrack: (sessionId, track) =>
          closePublishedTrack(signalingRef.current, sessionId, track),
      });
      if (publishPcRef.current !== previousPc) return;
      publishedRef.current = published;
      const { publish } = diffLocalTracks(published, desired);

      if (publish.length) {
        const { pc, sessionId } = await ensurePublishSession();
        await preparePeerSession(
          pc,
          () => publishPcRef.current === pc,
          () => resetPublisher(true)
        );
        if (publishPcRef.current !== pc) return;
        const added: Array<{
          plan: LocalTrackPlan;
          transceiver: RTCRtpTransceiver;
        }> = [];

        for (const plan of publish) {
          const source = localTrackSource(
            plan.kind,
            stream,
            screenStreamRef.current
          );
          if (!source || source.readyState === 'ended') continue;

          const transceiver = pc.addTransceiver(source, {
            direction: 'sendonly',
          });
          sendersRef.current.set(plan.trackName, transceiver.sender);
          added.push({ plan, transceiver });
        }

        if (added.length) {
          const offer = await pc.createOffer();
          if (publishPcRef.current !== pc) return;
          // Apply the offer before reading the assigned transceiver MIDs.
          await pc.setLocalDescription(offer);
          if (publishPcRef.current !== pc) return;

          const tracks: CloudflareSfuTrack[] = added.map(
            ({ plan: added_plan, transceiver }) => ({
              location: 'local',
              mid: transceiver.mid ?? undefined,
              trackName: added_plan.trackName,
            })
          );

          const answer = await signalingRef.current?.request<SfuTracksResponse>(
            {
              sessionDescription: {
                sdp: offer.sdp ?? '',
                type: 'offer',
              },
              sessionId,
              tracks,
              type: 'sfu.tracks.publish',
            }
          );

          if (publishPcRef.current !== pc) return;
          assertPublishedResponse(answer);
          await pc.setRemoteDescription(answer.sessionDescription);
          await waitForPeerConnection(pc);
          if (publishPcRef.current !== pc) return;
          publishedRef.current = [
            ...publishedRef.current,
            ...added.map(({ plan }) => plan),
          ];
        }
      }
    },
    [ensurePublishSession, resetPublisher]
  );

  const queueLocalTracks = useCallback(
    (stream: MediaStream, next: MeetMediaState) => {
      const task = publishQueue.current.then(() =>
        syncLocalTracks(stream, next)
      );
      publishQueue.current = task.catch(() => undefined);
      return task;
    },
    [syncLocalTracks]
  );

  syncForcedMediaRef.current = (next) => {
    publishPresence(next);
    void queueLocalTracks(
      localStreamRef.current ?? new MediaStream(),
      next
    ).catch(() => undefined);
  };

  useEffect(() => {
    if (!connectionGeneration || state.admission !== 'admitted') return;
    void queueLocalTracks(
      localStreamRef.current ?? new MediaStream(),
      mediaRef.current
    ).catch(() => undefined);
  }, [connectionGeneration, queueLocalTracks, state.admission]);

  // Serialize SDP exchanges across track broadcasts.
  useEffect(() => {
    if (state.admission !== 'admitted') return;
    const pull = async () => {
      if (!activeRef.current) return;
      const pending = planRemoteSubscriptions(
        stateRef.current.remoteTracks,
        subscribedRef.current,
        stateRef.current.selfUserId
      );
      if (!pending.length) return;
      pendingSubscriptionsRef.current = new Set(
        pending.map(
          (track) =>
            `${encodeURIComponent(track.sessionId ?? '')}:${encodeURIComponent(track.trackName ?? '')}`
        )
      );
      try {
        const { pc, sessionId } = await ensureSubscribeSession();
        await preparePeerSession(
          pc,
          () => subscribePcRef.current === pc,
          resetSubscriber
        );
        if (subscribePcRef.current !== pc) return;
        const answer = await signalingRef.current?.request<SfuTracksResponse>({
          sessionId,
          tracks: pending,
          type: 'sfu.tracks.subscribe',
        });
        if (subscribePcRef.current !== pc) return;
        for (const track of answer?.tracks ?? []) {
          const owner = userIdFromTrackName(track.trackName);
          const kind = track.trackName
            ?.split('-')
            .at(-1) as MeetRealtimeTrackKind;
          const requested = pending.find(
            (entry) => entry.trackName === track.trackName
          );
          if (track.mid && owner && requested)
            trackOwnersRef.current.set(track.mid, {
              userId: owner,
              kind,
              subscriptionKey: `${encodeURIComponent(requested.sessionId ?? '')}:${encodeURIComponent(track.trackName ?? '')}`,
            });
        }
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
      } finally {
        pendingSubscriptionsRef.current.clear();
      }
    };
    let active = true;
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      subscribeQueue.current = subscribeQueue.current
        .then(async () => {
          if (active) await pull();
        })
        .catch((error) => console.warn('Meet track subscription failed', error))
        .finally(() => {
          scheduled = false;
        });
    };
    schedule();
    const retry = setInterval(schedule, 1500);
    return () => {
      active = false;
      clearInterval(retry);
      if (stateRef.current.admission !== 'admitted') {
        subscribePcRef.current?.close();
        subscribePcRef.current = null;
        subscribeSessionRef.current = null;
        subscribedRef.current.clear();
      }
    };
  }, [ensureSubscribeSession, resetSubscriber, state.admission]);

  const applyMedia = useCallback(
    async (next: MeetMediaState, stream: MediaStream | null) => {
      const previous = mediaRef.current;
      mediaRef.current = next;
      setMedia(next);
      publishPresence(next);
      try {
        await queueLocalTracks(stream ?? new MediaStream(), next);
      } catch (error) {
        if (activeRef.current) {
          const restored = { ...mediaRef.current };
          for (const key of [
            'audioEnabled',
            'videoEnabled',
            'screenEnabled',
          ] as const)
            if (previous[key] !== next[key] && restored[key] === next[key])
              restored[key] = previous[key];
          restored.screenEnabled &&=
            screenStreamRef.current
              ?.getVideoTracks()
              .some((track) => track.readyState === 'live') ?? false;
          if (!restored.screenEnabled) {
            for (const track of screenStreamRef.current?.getTracks() ?? [])
              track.stop();
            screenStreamRef.current = null;
            setScreenStream(null);
          }
          mediaRef.current = restored;
          setMedia(restored);
          for (const track of localStreamRef.current?.getAudioTracks() ?? [])
            track.enabled = restored.audioEnabled;
          effects.setEnabled(restored.videoEnabled);
          publishPresence(restored);
          resetPublisher(true);
        }
        throw error;
      }
    },
    [effects, publishPresence, queueLocalTracks, resetPublisher]
  );

  const { toggleMicrophone, toggleCamera, toggleScreenShare } = useMemo(
    () =>
      createLocalMediaControls({
        activeRef,
        effects,
        localStreamRef,
        screenStreamRef,
        mediaRef,
        setLocalStream,
        setScreenStream,
        applyMedia,
      }),
    [applyMedia, effects]
  );

  const sharingUsers = Object.values(state.participants)
    .filter((entry) => entry.media.screenEnabled)
    .map((entry) => entry.userId)
    .sort()
    .join(',');
  const buildRemoteStreams = useMemo(() => createRemoteStreamCache(), []);
  const remoteStreams = useMemo(
    () => buildRemoteStreams(remoteMedia, sharingUsers),
    [buildRemoteStreams, remoteMedia, sharingUsers]
  );

  const actions = useMemo(() => createRoomActions(signalingRef), []);
  const leave = useCallback(() => {
    activeRef.current = false;
    clearInterval(heartbeatRef.current);
    signalingRef.current?.close();
    resetPublisher();
    resetSubscriber();
    effects.dispose();
    for (const track of localStreamRef.current?.getTracks() ?? []) track.stop();
    for (const track of screenStreamRef.current?.getTracks() ?? [])
      track.stop();
    localStreamRef.current = null;
    screenStreamRef.current = null;
    setLocalStream(null);
    setScreenStream(null);
    setConnectionStatus('closed');
  }, [effects, resetPublisher, resetSubscriber]);
  const setCameraLook = useCallback(
    async (look: CameraLook) => {
      const track = await effects.setLook(look);
      setCameraLookState(look);
      if (!track || !activeRef.current) return;
      const stream = new MediaStream([
        ...(localStreamRef.current?.getAudioTracks() ?? []),
        track,
      ]);
      localStreamRef.current = stream;
      setLocalStream(stream);
      await queueLocalTracks(stream, mediaRef.current);
    },
    [effects, queueLocalTracks]
  );

  const adoptPreview = useCallback(
    async (stream: MediaStream | null) => {
      const source = stream
        ?.getVideoTracks()
        .find((track) => track.readyState === 'live');
      if (!source) return;
      if (!activeRef.current) {
        source.stop();
        return;
      }
      const track = await effects.setSource(source);
      if (!track || !activeRef.current) {
        effects.dispose();
        return;
      }
      const next = new MediaStream([
        ...(localStreamRef.current?.getAudioTracks() ?? []),
        track,
      ]);
      localStreamRef.current = next;
      setLocalStream(next);
    },
    [effects]
  );
  return {
    ...actions,
    adoptPreview,
    leave,
    cameraLook,
    setCameraLook,
    remoteMedia,
    screenStream,
    getMediaDiagnostics: async () => ({
      signaling: connectionStatus,
      attachedParticipants: Object.keys(remoteMedia).length,
      publisher: await readPeerDiagnostics(publishPcRef.current),
      subscriber: await readPeerDiagnostics(subscribePcRef.current),
    }),
    reconnectMedia: () => {
      resetSubscriber();
      resetPublisher(true);
    },
    connectionStatus,
    localStream,
    localPreview: screenStream ?? localStream,
    media,
    remoteStreams,
    state,
    toggleCamera,
    toggleMicrophone,
    toggleScreenShare,
  };
}
