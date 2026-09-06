'use client';

import { createWorkspaceMeetingRealtimeToken } from '@tuturuuu/internal-api';

import type {
  CloudflareSfuSessionDescription,
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
  diffLocalTracks,
  type LocalTrackPlan,
  planLocalTracks,
  planRemoteSubscriptions,
  userIdFromTrackName,
} from '../lib/negotiation';
import { MeetSignaling, type MeetSignalingStatus } from '../lib/signaling';

type SfuSessionResponse = { sessionId?: string };
type SfuTracksResponse = {
  requiresImmediateRenegotiation?: boolean;
  sessionDescription?: CloudflareSfuSessionDescription;
  tracks?: Array<{ mid?: string; trackName?: string }>;
};

export interface UseMeetRoomOptions {
  meetingId: string;
  realtimeUrl: string;
  token: string;
  wsId: string;
}

export interface MeetRoomController {
  connectionStatus: MeetSignalingStatus;
  decideAdmission: (userId: string, admit: boolean) => void;
  localStream: MediaStream | null;
  localPreview: MediaStream | null;
  media: MeetMediaState;
  muteParticipant: (userId: string, kinds: MeetRealtimeTrackKind[]) => void;
  raiseHand: (raised: boolean) => void;
  removeParticipant: (userId: string) => void;
  remoteStreams: Record<string, MediaStream>;
  sendChat: (body: string) => void;
  setRecordingState: (state: 'recording' | 'idle', sessionId?: string) => void;
  state: CallState;
  toggleCamera: () => Promise<void>;
  toggleMicrophone: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
}

const PEER_CONFIG: RTCConfiguration = {
  bundlePolicy: 'max-bundle',
  iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
};

/**
 * Drives one participant's side of a call: the signaling socket, the single
 * publishing peer connection and the single subscribing peer connection.
 *
 * Cloudflare Realtime is not mesh — every participant keeps exactly two peer
 * connections to the SFU regardless of room size, which is what keeps a large
 * room affordable.
 */
export function useMeetRoom({
  meetingId,
  realtimeUrl,
  token,
  wsId,
}: UseMeetRoomOptions): MeetRoomController {
  const [state, setState] = useState<CallState>(INITIAL_CALL_STATE);
  const [connectionStatus, setConnectionStatus] =
    useState<MeetSignalingStatus>('connecting');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteMedia, setRemoteMedia] = useState<
    Record<string, Partial<Record<MeetRealtimeTrackKind, MediaStreamTrack>>>
  >({});
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
  const subscribedRef = useRef<Set<string>>(new Set());
  const screenStreamRef = useRef<MediaStream | null>(null);
  /** mid -> owning participant, the only way to attribute an inbound track. */
  const trackOwnersRef = useRef<
    Map<string, { userId: string; kind: MeetRealtimeTrackKind }>
  >(new Map());
  const stateRef = useRef(state);
  stateRef.current = state;

  const mediaRef = useRef(media);
  mediaRef.current = media;

  useEffect(() => {
    let usedInitialToken = false;

    /**
     * The token minted on the server is good for the first connect. Every
     * later attempt fetches a fresh one, because join tokens expire long
     * before a meeting does.
     */
    const resolveUrl = async () => {
      if (!usedInitialToken) {
        usedInitialToken = true;
        return `${realtimeUrl}?token=${encodeURIComponent(token)}`;
      }

      // The satellite proxies `/api/*` to web, which already owns meeting
      // token minting. Adding a local route here would both duplicate it and
      // break the satellite convention that only auth handoff runs locally.
      const refreshed = await createWorkspaceMeetingRealtimeToken(
        wsId,
        meetingId,
        { mode: 'call' }
      );
      return `${refreshed.realtimeUrl}?token=${encodeURIComponent(refreshed.token)}`;
    };

    const signaling = new MeetSignaling({
      onMessage: (message) => {
        if (
          message.type === 'participant.muted' &&
          message.userId === stateRef.current.selfUserId
        ) {
          const next = { ...mediaRef.current };
          for (const kind of message.kinds) {
            if (kind === 'audio') {
              next.audioEnabled = false;
              for (const track of localStreamRef.current?.getAudioTracks() ??
                [])
                track.enabled = false;
            }
            if (kind === 'video') {
              next.videoEnabled = false;
              for (const track of localStreamRef.current?.getVideoTracks() ??
                [])
                track.enabled = false;
            }
            if (kind === 'screen') {
              next.screenEnabled = false;
              for (const track of screenStreamRef.current?.getTracks() ?? [])
                track.stop();
              setScreenStream(null);
              screenStreamRef.current = null;
            }
          }
          mediaRef.current = next;
          setMedia(next);
        }
        setState((current) => reduceCallState(current, message));
      },
      onReconnected: () => {
        // The room forgot us while we were gone: re-announce, and clear the
        // subscription ledger so every remote track is pulled again onto the
        // fresh session.
        subscribedRef.current = new Set();
        trackOwnersRef.current = new Map();
        setRemoteMedia({});
        sendersRef.current.clear();
        setConnectionGeneration((value) => value + 1);
        subscribeSessionRef.current = null;
        subscribePcRef.current?.close();
        subscribePcRef.current = null;
        publishSessionRef.current = null;
        publishPcRef.current?.close();
        publishPcRef.current = null;
        publishedRef.current = [];

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

    return () => {
      clearInterval(heartbeat);
      signaling.close();
      for (const track of localStreamRef.current?.getTracks() ?? [])
        track.stop();
      for (const track of screenStreamRef.current?.getTracks() ?? [])
        track.stop();
      signalingRef.current = null;
      publishPcRef.current?.close();
      subscribePcRef.current?.close();
      publishPcRef.current = null;
      subscribePcRef.current = null;
      publishSessionRef.current = null;
      subscribeSessionRef.current = null;
      publishedRef.current = [];
      subscribedRef.current = new Set();
    };
  }, [meetingId, realtimeUrl, token, wsId]);

  /** Announces our media state so other clients can render mute badges. */
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

    const result = await signalingRef.current?.request<SfuSessionResponse>({
      type: 'sfu.session.create',
    });
    if (!result?.sessionId) throw new Error('sfu_session_failed');

    publishSessionRef.current = result.sessionId;
    return { pc, sessionId: result.sessionId };
  }, []);

  const ensureSubscribeSession = useCallback(async () => {
    if (subscribeSessionRef.current && subscribePcRef.current) {
      return {
        pc: subscribePcRef.current,
        sessionId: subscribeSessionRef.current,
      };
    }

    const pc = new RTCPeerConnection(PEER_CONFIG);
    subscribePcRef.current = pc;

    pc.addEventListener('track', (event) => {
      const mid = event.transceiver.mid;
      const owner = mid ? trackOwnersRef.current.get(mid) : undefined;
      if (!owner) return;
      setRemoteMedia((current) => ({
        ...current,
        [owner.userId]: { ...current[owner.userId], [owner.kind]: event.track },
      }));
    });

    const result = await signalingRef.current?.request<SfuSessionResponse>({
      type: 'sfu.session.create',
    });
    if (!result?.sessionId) throw new Error('sfu_session_failed');

    subscribeSessionRef.current = result.sessionId;
    return { pc, sessionId: result.sessionId };
  }, []);

  /** Pushes newly enabled local tracks to the SFU. */
  const syncLocalTracks = useCallback(
    async (stream: MediaStream, next: MeetMediaState) => {
      const selfUserId = stateRef.current.selfUserId;
      if (!selfUserId) return;

      const desired = planLocalTracks(selfUserId, next);
      const { publish } = diffLocalTracks(publishedRef.current, desired);

      // Keep stable SFU track names across mute/unmute and share restarts.
      // Replacing the sender source avoids duplicate transceivers/subscriptions.
      for (const plan of publishedRef.current) {
        const enabled = desired.some(
          (entry) => entry.trackName === plan.trackName
        );
        const source =
          plan.kind === 'screen'
            ? screenStreamRef.current?.getVideoTracks()[0]
            : plan.kind === 'audio'
              ? stream.getAudioTracks()[0]
              : stream.getVideoTracks()[0];
        await sendersRef.current
          .get(plan.trackName)
          ?.replaceTrack(enabled ? (source ?? null) : null);
      }

      if (publish.length) {
        const { pc, sessionId } = await ensurePublishSession();
        const added: Array<{
          plan: LocalTrackPlan;
          transceiver: RTCRtpTransceiver;
        }> = [];

        for (const plan of publish) {
          const source =
            plan.kind === 'screen'
              ? screenStreamRef.current?.getVideoTracks()[0]
              : plan.kind === 'audio'
                ? stream.getAudioTracks()[0]
                : stream.getVideoTracks()[0];
          if (!source) continue;

          const transceiver = pc.addTransceiver(source, {
            direction: 'sendonly',
          });
          sendersRef.current.set(plan.trackName, transceiver.sender);
          added.push({ plan, transceiver });
        }

        if (added.length) {
          const offer = await pc.createOffer();
          // Order matters: a transceiver's `mid` is null until the local
          // description is applied. Reading it any earlier publishes tracks
          // with no mid and Cloudflare rejects the whole request with
          // `406 tracks[0]: Missing mid in track`.
          await pc.setLocalDescription(offer);

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
          if (answer?.sessionDescription) {
            await pc.setRemoteDescription(answer.sessionDescription);
          }
          publishedRef.current = [
            ...publishedRef.current,
            ...added.map(({ plan }) => plan),
          ];
        }
      }
    },
    [ensurePublishSession]
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

  useEffect(() => {
    if (!connectionGeneration || state.admission !== 'admitted') return;
    void queueLocalTracks(
      localStreamRef.current ?? new MediaStream(),
      mediaRef.current
    ).catch(() => undefined);
  }, [connectionGeneration, queueLocalTracks, state.admission]);

  // Serialize SDP exchanges: a track broadcast must never cancel an in-flight
  // offer/answer and leave the subscriber in have-remote-offer.
  useEffect(() => {
    if (state.admission !== 'admitted') return;
    const pull = async () => {
      const pending = planRemoteSubscriptions(
        stateRef.current.remoteTracks,
        subscribedRef.current,
        stateRef.current.selfUserId
      );
      if (!pending.length) return;
      const { pc, sessionId } = await ensureSubscribeSession();
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
        if (track.mid && owner)
          trackOwnersRef.current.set(track.mid, { userId: owner, kind });
      }
      if (answer?.sessionDescription) {
        await pc.setRemoteDescription(answer.sessionDescription);
        const localAnswer = await pc.createAnswer();
        await pc.setLocalDescription(localAnswer);
        await signalingRef.current?.request({
          sessionDescription: { sdp: localAnswer.sdp ?? '', type: 'answer' },
          sessionId,
          type: 'sfu.renegotiate',
        });
      }
      for (const track of answer?.tracks ?? []) {
        if (!track.mid) continue;
        const roomTrack = Object.values(stateRef.current.remoteTracks).find(
          (entry) =>
            pending.some(
              (requested) =>
                requested.sessionId === entry.sessionId &&
                requested.trackName === track.trackName
            ) && entry.trackName === track.trackName
        );
        if (roomTrack) subscribedRef.current.add(remoteTrackKey(roomTrack));
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
    };
  }, [ensureSubscribeSession, state.admission]);

  const applyMedia = useCallback(
    async (next: MeetMediaState, stream: MediaStream | null) => {
      mediaRef.current = next;
      setMedia(next);
      publishPresence(next);
      await queueLocalTracks(stream ?? new MediaStream(), next);
    },
    [publishPresence, queueLocalTracks]
  );

  const toggleMicrophone = useCallback(async () => {
    let stream = localStreamRef.current;
    if (
      !stream?.getAudioTracks().some((track) => track.readyState === 'live')
    ) {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream = new MediaStream([
        ...(localStreamRef.current?.getVideoTracks() ?? []),
        ...audio.getAudioTracks(),
      ]);
      localStreamRef.current = stream;
      setLocalStream(stream);
    }
    for (const track of stream.getAudioTracks()) {
      track.enabled = !mediaRef.current.audioEnabled;
    }
    await applyMedia(
      { ...mediaRef.current, audioEnabled: !mediaRef.current.audioEnabled },
      stream
    );
  }, [applyMedia]);

  const toggleCamera = useCallback(async () => {
    let stream = localStreamRef.current;
    if (
      !stream?.getVideoTracks().some((track) => track.readyState === 'live')
    ) {
      const video = await navigator.mediaDevices.getUserMedia({ video: true });
      stream = new MediaStream([
        ...(localStreamRef.current?.getAudioTracks() ?? []),
        ...video.getVideoTracks(),
      ]);
      localStreamRef.current = stream;
      setLocalStream(stream);
    }
    for (const track of stream.getVideoTracks()) {
      track.enabled = !mediaRef.current.videoEnabled;
    }
    await applyMedia(
      { ...mediaRef.current, videoEnabled: !mediaRef.current.videoEnabled },
      stream
    );
  }, [applyMedia]);

  const toggleScreenShare = useCallback(async () => {
    if (mediaRef.current.screenEnabled) {
      for (const track of screenStreamRef.current?.getTracks() ?? []) {
        track.stop();
      }
      screenStreamRef.current = null;
      setScreenStream(null);
      await applyMedia(
        { ...mediaRef.current, screenEnabled: false },
        localStreamRef.current
      );
      return;
    }

    const display = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    });
    screenStreamRef.current = display;
    setScreenStream(display);
    // Ending the share from the browser's own bar must update the room too.
    display.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (screenStreamRef.current !== display) return;
      screenStreamRef.current = null;
      setScreenStream(null);
      void applyMedia(
        { ...mediaRef.current, screenEnabled: false },
        localStreamRef.current
      ).catch(() => undefined);
    });
    await applyMedia(
      { ...mediaRef.current, screenEnabled: true },
      localStreamRef.current
    );
  }, [applyMedia]);

  const sharingUsers = Object.values(state.participants)
    .filter((entry) => entry.media.screenEnabled)
    .map((entry) => entry.userId)
    .sort()
    .join(',');
  const remoteStreams = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(remoteMedia).map(([userId, tracks]) => {
          const sharing = sharingUsers.split(',').includes(userId);
          const video = sharing ? tracks.screen : tracks.video;
          return [
            userId,
            new MediaStream(
              [tracks.audio, video].filter((track): track is MediaStreamTrack =>
                Boolean(track)
              )
            ),
          ];
        })
      ),
    [remoteMedia, sharingUsers]
  );

  const sendChat = useCallback((body: string) => {
    const trimmed = body.trim();
    if (trimmed)
      signalingRef.current?.send({ body: trimmed, type: 'chat.message' });
  }, []);

  const raiseHand = useCallback((raised: boolean) => {
    signalingRef.current?.send({ raised, type: 'hand.raise' });
  }, []);

  const decideAdmission = useCallback((userId: string, admit: boolean) => {
    signalingRef.current?.send({ admit, type: 'admission.decide', userId });
  }, []);

  const muteParticipant = useCallback(
    (userId: string, kinds: MeetRealtimeTrackKind[]) => {
      signalingRef.current?.send({ kinds, type: 'participant.mute', userId });
    },
    []
  );

  const removeParticipant = useCallback((userId: string) => {
    signalingRef.current?.send({ type: 'participant.remove', userId });
  }, []);

  const setRecordingState = useCallback(
    (recordingState: 'recording' | 'idle', sessionId?: string) => {
      signalingRef.current?.send({
        recordingSessionId: sessionId,
        state: recordingState,
        type: 'recording.state',
      });
    },
    []
  );

  return {
    connectionStatus,
    decideAdmission,
    localStream,
    localPreview: screenStream ?? localStream,
    media,
    muteParticipant,
    raiseHand,
    removeParticipant,
    remoteStreams,
    sendChat,
    setRecordingState,
    state,
    toggleCamera,
    toggleMicrophone,
    toggleScreenShare,
  };
}
