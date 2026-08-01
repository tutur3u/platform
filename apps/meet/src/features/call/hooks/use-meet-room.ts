'use client';

import type {
  CloudflareSfuSessionDescription,
  CloudflareSfuTrack,
  MeetMediaState,
  MeetRealtimeTrackKind,
} from '@tuturuuu/realtime/meet';
import { useCallback, useEffect, useRef, useState } from 'react';
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
} from '../lib/negotiation';
import { MeetSignaling, type MeetSignalingStatus } from '../lib/signaling';

type SfuSessionResponse = { sessionId?: string };
type SfuTracksResponse = {
  requiresImmediateRenegotiation?: boolean;
  sessionDescription?: CloudflareSfuSessionDescription;
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
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});
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
      const response = await fetch(
        `/api/v1/workspaces/${encodeURIComponent(wsId)}/meetings/${encodeURIComponent(meetingId)}/realtime-token`,
        {
          body: JSON.stringify({ mode: 'call' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }
      );
      if (!response.ok) throw new Error('token_refresh_failed');

      const refreshed = (await response.json()) as {
        realtimeUrl: string;
        token: string;
      };
      return `${refreshed.realtimeUrl}?token=${encodeURIComponent(refreshed.token)}`;
    };

    const signaling = new MeetSignaling({
      onMessage: (message) =>
        setState((current) => reduceCallState(current, message)),
      onReconnected: () => {
        // The room forgot us while we were gone: re-announce, and clear the
        // subscription ledger so every remote track is pulled again onto the
        // fresh session.
        subscribedRef.current = new Set();
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

    return () => {
      signaling.close();
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
      const [stream] = event.streams;
      const trackId = event.track.id;
      setRemoteStreams((current) => ({
        ...current,
        [trackId]: stream ?? new MediaStream([event.track]),
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
      const { publish, unpublish } = diffLocalTracks(
        publishedRef.current,
        desired
      );

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

          added.push({
            plan,
            transceiver: pc.addTransceiver(source, { direction: 'sendonly' }),
          });
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

          if (answer?.sessionDescription) {
            await pc.setRemoteDescription(answer.sessionDescription);
          }
          publishedRef.current = [
            ...publishedRef.current,
            ...added.map(({ plan }) => plan),
          ];
        }
      }

      if (unpublish.length && publishSessionRef.current) {
        await signalingRef.current
          ?.request({
            sessionId: publishSessionRef.current,
            tracks: unpublish.map((plan) => ({ trackName: plan.trackName })),
            type: 'sfu.tracks.close',
          })
          .catch(() => undefined);

        publishedRef.current = publishedRef.current.filter(
          (plan) => !unpublish.some((t) => t.trackName === plan.trackName)
        );
      }
    },
    [ensurePublishSession]
  );

  // Pull any remote track we are not already receiving.
  useEffect(() => {
    if (state.admission !== 'admitted') return;

    const pending = planRemoteSubscriptions(
      state.remoteTracks,
      subscribedRef.current,
      state.selfUserId
    );
    if (!pending.length) return;

    let cancelled = false;

    void (async () => {
      try {
        const { pc, sessionId } = await ensureSubscribeSession();
        // No sessionDescription: pulling remote tracks means Cloudflare sends
        // us the offer, which we answer below via `sfu.renegotiate`.
        const answer = await signalingRef.current?.request<SfuTracksResponse>({
          sessionId,
          tracks: pending,
          type: 'sfu.tracks.subscribe',
        });
        if (cancelled) return;

        if (answer?.sessionDescription) {
          await pc.setRemoteDescription(answer.sessionDescription);
          const localAnswer = await pc.createAnswer();
          await pc.setLocalDescription(localAnswer);

          await signalingRef.current?.request({
            sessionDescription: {
              sdp: localAnswer.sdp ?? '',
              type: 'answer',
            },
            sessionId,
            type: 'sfu.renegotiate',
          });
        }

        for (const track of Object.values(state.remoteTracks)) {
          subscribedRef.current.add(remoteTrackKey(track));
        }
      } catch {
        // A failed pull is retried on the next track broadcast.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    ensureSubscribeSession,
    state.admission,
    state.remoteTracks,
    state.selfUserId,
  ]);

  const applyMedia = useCallback(
    async (next: MeetMediaState, stream: MediaStream | null) => {
      setMedia(next);
      publishPresence(next);
      if (stream) await syncLocalTracks(stream, next);
    },
    [publishPresence, syncLocalTracks]
  );

  const toggleMicrophone = useCallback(async () => {
    let stream = localStream;
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setLocalStream(stream);
    }
    for (const track of stream.getAudioTracks()) {
      track.enabled = !media.audioEnabled;
    }
    await applyMedia({ ...media, audioEnabled: !media.audioEnabled }, stream);
  }, [applyMedia, localStream, media]);

  const toggleCamera = useCallback(async () => {
    let stream = localStream;
    if (!stream || stream.getVideoTracks().length === 0) {
      const video = await navigator.mediaDevices.getUserMedia({ video: true });
      stream = new MediaStream([
        ...(localStream?.getAudioTracks() ?? []),
        ...video.getVideoTracks(),
      ]);
      setLocalStream(stream);
    }
    for (const track of stream.getVideoTracks()) {
      track.enabled = !media.videoEnabled;
    }
    await applyMedia({ ...media, videoEnabled: !media.videoEnabled }, stream);
  }, [applyMedia, localStream, media]);

  const toggleScreenShare = useCallback(async () => {
    if (media.screenEnabled) {
      for (const track of screenStreamRef.current?.getTracks() ?? []) {
        track.stop();
      }
      screenStreamRef.current = null;
      await applyMedia({ ...media, screenEnabled: false }, localStream);
      return;
    }

    const display = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    });
    screenStreamRef.current = display;
    // Ending the share from the browser's own bar must update the room too.
    display.getVideoTracks()[0]?.addEventListener('ended', () => {
      screenStreamRef.current = null;
      setMedia((current) => {
        const next = { ...current, screenEnabled: false };
        publishPresence(next);
        return next;
      });
    });
    await applyMedia({ ...media, screenEnabled: true }, localStream);
  }, [applyMedia, localStream, media, publishPresence]);

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
