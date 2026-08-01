import { z } from 'zod';
import {
  cloudflareSfuSessionDescriptionSchema,
  cloudflareSfuTrackSchema,
  type MeetRealtimePresence,
  type MeetRealtimeRecordingState,
  type MeetRealtimeRole,
  type MeetRealtimeRoomMode,
  type MeetRealtimeStageState,
  type MeetRealtimeStreamState,
  type MeetRealtimeTokenPayload,
  type MeetRealtimeTrackKind,
  type MeetRealtimeWaitingParticipant,
  meetMediaStateSchema,
  meetRealtimeRecordingStateSchema,
  meetRealtimeStageStateSchema,
  meetRealtimeStreamStateSchema,
  meetRealtimeTrackKindSchema,
} from './primitives';

const requestId = z.string().trim().min(1).max(120).optional();
const participantId = z.string().uuid();

export const meetRealtimeClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    displayName: z.string().trim().min(1).max(120).optional(),
    media: meetMediaStateSchema.optional(),
    type: z.literal('presence.join'),
  }),
  z.object({
    media: meetMediaStateSchema,
    type: z.literal('presence.update'),
  }),
  z.object({
    body: z.string().trim().min(1).max(2_000),
    requestId,
    type: z.literal('chat.message'),
  }),
  z.object({
    requestId,
    stage: meetRealtimeStageStateSchema,
    type: z.literal('stage.update'),
  }),
  // Self-service hand raise. `stage.update` stays host-only; without this a
  // participant could never raise their own hand.
  z.object({
    raised: z.boolean(),
    requestId,
    type: z.literal('hand.raise'),
  }),
  z.object({
    admit: z.boolean(),
    requestId,
    type: z.literal('admission.decide'),
    userId: participantId,
  }),
  z.object({
    kinds: z.array(meetRealtimeTrackKindSchema).min(1),
    requestId,
    type: z.literal('participant.mute'),
    userId: participantId,
  }),
  z.object({
    requestId,
    type: z.literal('participant.remove'),
    userId: participantId,
  }),
  z.object({
    recordingSessionId: z.string().trim().min(1).max(180).optional(),
    requestId,
    state: meetRealtimeRecordingStateSchema,
    type: z.literal('recording.state'),
  }),
  z.object({
    requestId,
    sessionDescription: cloudflareSfuSessionDescriptionSchema.optional(),
    type: z.literal('sfu.session.create'),
  }),
  z.object({
    requestId,
    sessionDescription: cloudflareSfuSessionDescriptionSchema,
    sessionId: z.string().trim().min(1),
    tracks: z.array(cloudflareSfuTrackSchema).min(1),
    type: z.literal('sfu.tracks.publish'),
  }),
  z.object({
    requestId,
    // Optional by design: when pulling remote tracks the client has no offer
    // to send. Cloudflare replies with an offer, which the client answers via
    // `sfu.renegotiate`. Requiring it here forced callers to send `sdp: ''`,
    // which the schema then rejected as malformed.
    sessionDescription: cloudflareSfuSessionDescriptionSchema.optional(),
    sessionId: z.string().trim().min(1),
    tracks: z.array(cloudflareSfuTrackSchema).min(1),
    type: z.literal('sfu.tracks.subscribe'),
  }),
  z.object({
    requestId,
    sessionDescription: cloudflareSfuSessionDescriptionSchema,
    sessionId: z.string().trim().min(1),
    type: z.literal('sfu.renegotiate'),
  }),
  z.object({
    requestId,
    sessionId: z.string().trim().min(1),
    tracks: z.array(cloudflareSfuTrackSchema).min(1),
    type: z.literal('sfu.tracks.close'),
  }),
  z.object({
    requestId,
    state: meetRealtimeStreamStateSchema,
    type: z.literal('stream.state'),
  }),
]);

export type MeetRealtimeClientMessage = z.infer<
  typeof meetRealtimeClientMessageSchema
>;

export type MeetRealtimeSfuClientMessage = Extract<
  MeetRealtimeClientMessage,
  { type: `sfu.${string}` }
>;

export type MeetRealtimeRoomTrack = {
  kind?: string;
  mid?: string;
  sessionId: string;
  trackName?: string;
  userId: string;
};

export type MeetRealtimeServerMessage =
  | {
      admission: 'admitted' | 'waiting';
      expiresAt: string;
      limits: MeetRealtimeTokenPayload['limits'];
      mode: MeetRealtimeRoomMode;
      role: MeetRealtimeRole;
      roomId: string;
      stage: MeetRealtimeStageState;
      type: 'ready';
      userId: string;
    }
  | {
      presence: MeetRealtimePresence[];
      roomId: string;
      type: 'presence';
    }
  | {
      body: string;
      createdAt: string;
      displayName: string;
      id: string;
      requestId?: string;
      type: 'chat.message';
      userId: string;
    }
  | {
      requestId?: string;
      stage: MeetRealtimeStageState;
      type: 'stage';
    }
  | {
      participants: MeetRealtimeWaitingParticipant[];
      type: 'admission.pending';
    }
  | {
      admitted: boolean;
      decidedBy: string;
      type: 'admission.result';
    }
  | {
      by: string;
      kinds: MeetRealtimeTrackKind[];
      requestId?: string;
      type: 'participant.muted';
      userId: string;
    }
  | {
      by: string;
      requestId?: string;
      type: 'participant.removed';
      userId: string;
    }
  | {
      recordingSessionId?: string;
      requestId?: string;
      state: MeetRealtimeRecordingState;
      type: 'recording.state';
    }
  | {
      action: MeetRealtimeClientMessage['type'];
      requestId?: string;
      result: unknown;
      type: 'sfu.response';
    }
  | {
      requestId?: string;
      sessionId: string;
      tracks: MeetRealtimeRoomTrack[];
      type: 'track.published' | 'track.closed';
      userId: string;
    }
  | {
      requestId?: string;
      state: MeetRealtimeStreamState;
      type: 'stream.state';
    }
  | {
      error: string;
      requestId?: string;
      type: 'error';
    };
