'use client';
import { handleLiveQaMessage } from '../tools/live-activities/qa/qa-handler';
import { createMeetCallRealtimeToken } from '@tuturuuu/internal-api';
import { deliverRoomAssistantAudio } from '@tuturuuu/meet-core/features/live-assistant/room-audio';
import {
  type CloudflareSfuTrack,
  type MeetMediaState,
  publishedCameraRids,
} from '@tuturuuu/realtime/meet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addLocalTransceiver,
  useAdaptiveSenderBandwidth,
} from '../lib/bandwidth';
import {
  type CallState,
  clampLocalMedia,
  localMediaLocks,
  reduceCallState,
  remoteTrackKey,
} from '../lib/call-state';
import { microphoneMids, withOpusResilience } from '../lib/audio-sdp';
import { CameraEffects } from '../lib/camera-effects';
import {
  IDLE_MEDIA,
  INITIAL_PRESENCE_STATE,
  stopLocalCapture,
  usePresenceTransport,
} from '../lib/presence-transport';
import { createLocalMediaControls } from '../lib/local-media-controls';
import { createMediaDiagnosticsReader } from '../lib/media-diagnostics';
import { openPeerSession } from '../lib/open-peer-session';
import { recoverMediaState } from '../lib/recover-media-state';
import {
  createRoomActions,
  type StageVideoWindow,
  useRoomControlBridge,
} from '../lib/room-actions';
import type {
  MeetRoomController,
  UseMeetRoomOptions,
} from '../lib/room-controller';
import { useCameraControls } from './use-camera-controls';
import { usePublishSession } from './use-publish-session';
import { useSoloTransport } from './use-solo-transport';
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
  useRecentSpeakers,
  useWindowedSubscriber,
} from '../lib/negotiation';
import {
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
  releaseClosedSubscriptions,
} from '../lib/remote-playback';
import {
  createRemoteStreamCache,
  type RemoteMedia,
} from '../lib/remote-streams';
import type { SfuTracksResponse } from '../lib/sfu-response';
import { MeetSignaling, type MeetSignalingStatus } from '../lib/signaling';
/** Coordinate room signaling, local capture, and recoverable media transport. */
export function useMeetRoom({
  meetingId,
  realtimeUrl,
  token,
  deviceId,
}: UseMeetRoomOptions): MeetRoomController {
  const diagnostics = useMemo(() => createMediaDiagnosticsReader(), []);
  const effects = useMemo(() => new CameraEffects(), []);
  const activeRef = useRef(true);
  const [state, setState] = useState<CallState>(INITIAL_PRESENCE_STATE);
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
  const [media, setMedia] = useState<MeetMediaState>(IDLE_MEDIA);
  const signalingRef = useRef<MeetSignaling | null>(null);
  const stageWindow = useRef<StageVideoWindow | null>(null);
  const actions = useMemo(
    () => createRoomActions(signalingRef, stageWindow),
    []
  );
  const publishPcRef = useRef<RTCPeerConnection | null>(null);
  const subscribePcRef = useRef<RTCPeerConnection | null>(null);
  const publishSessionRef = useRef<string | null>(null);
  const subscribeSessionRef = useRef<string | null>(null);
  const publishedRef = useRef<LocalTrackPlan[]>([]);
  const pendingSubscriptionsRef = useRef(new Set<string>());
  const subscribedRef = useRef<Set<string>>(new Set());
  const screenStreamRef = useRef<MediaStream | null>(null);
  const trackOwnersRef = useRef<Map<string, RemoteTrackOwner>>(new Map());
  const stateRef = useRef(state);
  stateRef.current = state;
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const syncForcedMediaRef = useRef<
    (next: MeetMediaState, muteAudio: boolean) => void
  >(() => {});
  const publishEpoch = useRef(0);
  const resetPublisher = useCallback((recover = false) => {
    publishEpoch.current++;
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
    const resolveUrl = async (signal?: AbortSignal) => {
      if (!usedInitialToken) {
        usedInitialToken = true;
        return `${realtimeUrl}?presenceDelta=1&token=${encodeURIComponent(token)}`;
      }
      const refreshed = await createMeetCallRealtimeToken(
        meetingId,
        undefined,
        deviceId ? { deviceId, joinMode: 'additional' } : undefined,
        signal
      );
      if (refreshed.requiresDeviceChoice)
        throw new Error('Device confirmation required');
      return `${refreshed.realtimeUrl}?presenceDelta=1&token=${encodeURIComponent(refreshed.token)}`;
    };
    const signaling = new MeetSignaling({
      onMessage: (message) => {
        deliverRoomAssistantAudio(meetingId, message);
        handleLiveQaMessage(meetingId, message, actions.sendLiveQa);
        if (message.type === 'ready' && message.admission === 'admitted') {
          resetSubscriber();
          if (!message.resumed) {
            resetPublisher();
            setConnectionGeneration((value) => value + 1);
          }
        }
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
          syncForcedMediaRef.current(next, message.kinds.includes('audio'));
        }
        setState((current) => {
          const next = reduceCallState(current, message);
          stateRef.current = next;
          return next;
        });
      },
      onReconnected: () => {
        actions.replayPresenceJoin(mediaRef.current);
        actions.replayAssistantAudio();
      },
      onStatusChange: setConnectionStatus,
      resolveUrl,
    });
    signalingRef.current = signaling;
    signaling.connect();
    return () => {
      activeRef.current = false;
      effects.dispose();
      signaling.close();
      stopLocalCapture(
        effects,
        localStreamRef,
        screenStreamRef,
        setLocalStream,
        setScreenStream
      );
      mediaRef.current = IDLE_MEDIA;
      setMedia(mediaRef.current);
      signalingRef.current = null;
      resetPublisher();
      subscribePcRef.current?.close();
      subscribePcRef.current = null;
      subscribeSessionRef.current = null;
      subscribedRef.current = new Set();
    };
  }, [
    effects,
    meetingId,
    realtimeUrl,
    resetPublisher,
    resetSubscriber,
    token,
    deviceId,
    actions,
  ]);
  const publishPresence = useCallback((next: MeetMediaState) => {
    signalingRef.current?.send({ media: next, type: 'presence.update' });
  }, []);
  const mediaAllowed = usePresenceTransport(
    stateRef,
    state.settings.transport,
    localStreamRef,
    screenStreamRef,
    mediaRef,
    effects,
    resetPublisher,
    resetSubscriber,
    setLocalStream,
    setScreenStream,
    setMedia,
    publishPresence
  );
  const ensurePublishSession = usePublishSession(
    publishPcRef,
    publishSessionRef,
    signalingRef,
    resetPublisher,
    mediaAllowed
  );
  const ensureSubscribeSession = useCallback(async () => {
    if (!mediaAllowed()) throw new Error('presence_only');
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
    return openPeerSession(
      pc,
      subscribePcRef,
      subscribeSessionRef,
      signalingRef,
      resetSubscriber
    );
  }, [resetSubscriber, mediaAllowed]);
  /** Pushes newly enabled local tracks to the SFU. */
  const syncLocalTracks = useCallback(
    async (stream: MediaStream, next: MeetMediaState) => {
      if (
        !activeRef.current ||
        !mediaAllowed() ||
        Object.keys(stateRef.current.participants).length < 2
      )
        return;
      const selfUserId = stateRef.current.selfUserId;
      if (!selfUserId) return;
      const desired = planLocalTracks(
        selfUserId,
        clampLocalMedia(stateRef.current, next),
        screenStreamRef.current
          ?.getAudioTracks()
          .some((track) => track.readyState === 'live')
      );
      const previousPc = publishPcRef.current,
        epoch = publishEpoch.current;
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
          track.kind &&
          localMediaLocks(stateRef.current)[
            track.kind === 'screen_audio' ? 'screen' : track.kind
          ]
            ? Promise.resolve()
            : closePublishedTrack(signalingRef.current, sessionId, track),
      });
      if (publishPcRef.current !== previousPc || publishEpoch.current !== epoch)
        return;
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
          const transceiver = addLocalTransceiver(
            pc,
            source,
            plan.kind,
            Object.keys(stateRef.current.participants).length,
            publishedCameraRids(stateRef.current.mediaCapabilities),
            stateRef.current.streamLimits
          );
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
              kind: added_plan.kind,
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
          await pc.setRemoteDescription(
            withOpusResilience(answer.sessionDescription, microphoneMids(pc))
          );
          await waitForPeerConnection(pc);
          if (publishPcRef.current !== pc) return;
          publishedRef.current = [
            ...publishedRef.current,
            ...added.map(({ plan }) => plan),
          ];
        }
      }
    },
    [ensurePublishSession, resetPublisher, mediaAllowed]
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
  const resumeLocalMedia = useCallback(() => {
    void queueLocalTracks(
      localStreamRef.current ?? new MediaStream(),
      mediaRef.current
    ).catch(() => undefined);
  }, [queueLocalTracks]);
  useSoloTransport(
    Math.max(0, Object.keys(state.participants).length - 1),
    state.admission === 'admitted',
    connectionStatus,
    {
      session: publishSessionRef,
      signaling: signalingRef,
    },
    resetPublisher,
    resetSubscriber,
    resumeLocalMedia
  );
  syncForcedMediaRef.current = (next, muteAudio) => {
    if (muteAudio) localControls.cancelPendingMicrophone();
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
  useWindowedSubscriber({
    activeRef,
    stateRef,
    admission: mediaAllowed() ? state.admission : 'waiting',
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
    policy: actions.mediaPolicy,
  });
  useRecentSpeakers(
    state.admission === 'admitted',
    subscribePcRef,
    trackOwnersRef,
    setState
  );
  const applyMedia = useCallback(
    async (next: MeetMediaState, stream: MediaStream | null) => {
      const previous = mediaRef.current;
      const allowed = clampLocalMedia(stateRef.current, next);
      if (next.videoEnabled && !allowed.videoEnabled)
        for (const track of stream?.getVideoTracks() ?? []) track.stop();
      if (next.audioEnabled && !allowed.audioEnabled)
        for (const track of stream?.getAudioTracks() ?? [])
          track.enabled = false;
      if (next.screenEnabled && !allowed.screenEnabled) {
        for (const track of screenStreamRef.current?.getTracks() ?? [])
          track.stop();
        screenStreamRef.current = null;
        setScreenStream(null);
      }
      next = allowed;
      mediaRef.current = next;
      setMedia(next);
      if (activeRef.current) publishPresence(next);
      try {
        await queueLocalTracks(stream ?? new MediaStream(), next);
      } catch (error) {
        const restored = clampLocalMedia(
          stateRef.current,
          recoverMediaState(
            previous,
            next,
            mediaRef.current,
            !!localStreamRef.current
              ?.getAudioTracks()
              .some((track) => track.enabled)
          )
        );
        restored.screenEnabled &&=
          activeRef.current &&
          (screenStreamRef.current
            ?.getVideoTracks()
            .some((track) => track.readyState === 'live') ??
            false);
        if (!restored.screenEnabled) {
          for (const track of screenStreamRef.current?.getTracks() ?? [])
            track.stop();
          screenStreamRef.current = null;
          setScreenStream(null);
        }
        mediaRef.current = restored;
        setMedia(restored);
        if (activeRef.current) {
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
  const localControls = useMemo(
    () =>
      createLocalMediaControls({
        activeRef,
        canCapture: mediaAllowed,
        effects,
        localStreamRef,
        screenStreamRef,
        mediaRef,
        setLocalStream,
        setScreenStream,
        applyMedia,
      }),
    [applyMedia, effects, mediaAllowed]
  );
  const { setBandwidthMode, getBandwidthMode } = useAdaptiveSenderBandwidth({
    peer: publishPcRef,
    senders: sendersRef,
    state: stateRef,
    stage: stageWindow,
    policy: actions.mediaPolicy,
  });
  const locks = useRoomControlBridge(actions, state);
  useEffect(() => {
    if (state.presenceNeedsResync && connectionStatus === 'open')
      signalingRef.current?.send({ type: 'presence.resync' });
  }, [connectionStatus, state.presenceNeedsResync]);
  useEffect(() => {
    if (locks.audio) {
      localControls.cancelPendingMicrophone();
      for (const track of localStreamRef.current?.getAudioTracks() ?? [])
        track.stop();
    }
    if (locks.video) {
      for (const track of localStreamRef.current?.getVideoTracks() ?? [])
        track.stop();
      effects.dispose();
    }
    if (locks.audio || locks.video || locks.screen)
      void applyMedia({ ...mediaRef.current }, localStreamRef.current).catch(
        () => undefined
      );
  }, [
    applyMedia,
    effects,
    localControls,
    locks.audio,
    locks.video,
    locks.screen,
  ]);
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
  const leave = useCallback(() => {
    activeRef.current = false;
    signalingRef.current?.close();
    resetPublisher();
    resetSubscriber();
    stopLocalCapture(
      effects,
      localStreamRef,
      screenStreamRef,
      setLocalStream,
      setScreenStream
    );
    setConnectionStatus('closed');
  }, [effects, resetPublisher, resetSubscriber]);
  const { cameraLook, setCameraLook, adoptPreview } = useCameraControls(
    effects,
    activeRef,
    localStreamRef,
    mediaRef,
    setLocalStream,
    queueLocalTracks
  );
  return {
    ...actions,
    setBandwidthMode,
    getBandwidthMode,
    adoptPreview: async (stream) => {
      if (!mediaAllowed()) {
        for (const track of stream?.getTracks() ?? []) track.stop();
        return;
      }
      const { audio, video } = localMediaLocks(stateRef.current);
      if (audio)
        for (const track of stream?.getAudioTracks() ?? []) track.stop();
      if (video)
        for (const track of stream?.getVideoTracks() ?? []) track.stop();
      await adoptPreview(stream);
    },
    leave,
    cameraLook,
    setCameraLook,
    remoteMedia,
    screenStream,
    getMediaDiagnostics: () =>
      diagnostics(
        connectionStatus,
        Object.keys(remoteMedia).length,
        publishPcRef.current,
        subscribePcRef.current
      ),
    reconnectReceivingMedia: resetSubscriber,
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
    ...localControls,
    selectDevice: async (kind, id) => {
      if (!localMediaLocks(stateRef.current)[kind])
        await localControls.selectDevice(kind, id);
    },
    toggleCamera: async () => {
      if (!localMediaLocks(stateRef.current).video)
        await localControls.toggleCamera();
    },
    toggleMicrophone: async () => {
      if (!localMediaLocks(stateRef.current).audio)
        await localControls.toggleMicrophone();
    },
    unmuteMicrophone: async () => {
      if (!localMediaLocks(stateRef.current).audio)
        await localControls.unmuteMicrophone();
    },
    toggleScreenShare: async () => {
      if (!localMediaLocks(stateRef.current).screen)
        await localControls.toggleScreenShare();
    },
  };
}
