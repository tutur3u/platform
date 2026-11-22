import { z } from 'zod';
import {
  liveActivityClientMessages,
  type LiveActivitiesServerMessage,
} from './live-activities-schema';
import { penboardClientMessages, type PenboardServerMessage } from './penboard';
import type { LiveQaSnapshot } from './live-qa';
import type { ClassTimer } from './class-timer';
import {
  type MeetRoomMediaQualitySummary,
  meetMediaQualitySampleSchema,
} from './room-media-quality';
import type { MeetCameraRid, MeetMediaCapability } from './simulcast-layers';
import type { MeetStreamEntitlement } from './stream-tiers';
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
  meetAssistantAudioSchema,
  meetMediaStateSchema,
  meetRealtimeRecordingStateSchema,
  meetRealtimeStageStateSchema,
  meetRealtimeStreamStateSchema,
  meetRealtimeTrackKindSchema,
} from './primitives';
import { normalizeDisplayNameText } from './room-display-name';
import {
  type MeetApprovedParticipant,
  type MeetReaction,
  type MeetRoomSettings,
  meetReactionSchema,
  meetMediaOverrideSchema,
  meetRoomSettingsPatchSchema,
} from './room-options';
import {
  type TranscriptionConsentMessage,
  type TranscriptionStateMessage,
  transcriptionConsentMessageSchema,
  transcriptionStateMessageSchema,
} from './transcription';

const requestId = z.string().trim().min(1).max(120).optional();
const participantId = z.string().uuid();

/** Where a person is in the room: the call stage, a collaboration surface, or a hub tool. */
export const meetRoomViewSchema = z.discriminatedUnion('surface', [
  z.object({ surface: z.literal('stage') }),
  z.object({ surface: z.literal('programming') }),
  z.object({ surface: z.literal('document') }),
  z.object({
    surface: z.literal('tool'),
    toolId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  }),
]);
export type MeetRoomView = z.infer<typeof meetRoomViewSchema>;

export const MEET_NAVIGATION_MODES = [
  'summon',
  'follow',
  'follow.update',
  'follow.stop',
] as const;
export type MeetNavigationMode = (typeof MEET_NAVIGATION_MODES)[number];
export const MEET_NAVIGATION_MAX_TARGETS = 200;

const navigationRequestSchema = z
  .object({
    type: z.literal('navigation.request'),
    requestId,
    mode: z.enum(MEET_NAVIGATION_MODES),
    targets: z.union([
      z.literal('everyone'),
      z.array(participantId).min(1).max(MEET_NAVIGATION_MAX_TARGETS),
    ]),
    view: meetRoomViewSchema.optional(),
  })
  .refine((message) => message.mode === 'follow.stop' || !!message.view, {
    message: 'view is required',
    path: ['view'],
  });

export const meetRealtimeClientMessageSchema = z.discriminatedUnion('type', [
  transcriptionStateMessageSchema,
  transcriptionConsentMessageSchema,
  ...liveActivityClientMessages,
  ...penboardClientMessages,
  z.object({ type: z.literal('qa.read'), requestId }),
  z.object({
    type: z.literal('qa.ask'),
    text: z.string().trim().min(1).max(400),
    requestId,
  }),
  z.object({
    type: z.literal('qa.upvote'),
    questionId: z.string().uuid(),
    upvoted: z.boolean(),
    requestId,
  }),
  z.object({
    type: z.literal('qa.moderate'),
    questionId: z.string().uuid(),
    field: z.enum(['hidden', 'answered']),
    value: z.boolean(),
    requestId,
  }),
  z.object({ type: z.literal('qa.clear'), requestId }),
  z.object({
    type: z.literal('media.quality'),
    sample: meetMediaQualitySampleSchema,
  }),
  z.object({ type: z.literal('media.quality.read'), requestId }),
  z.object({
    type: z.literal('usage.report'),
    reportId: z.uuid(),
    bytesReceived: z.number().int().min(0).max(1_000_000_000_000),
  }),
  z.object({
    type: z.literal('assistant.preferences'),
    audio: meetAssistantAudioSchema,
  }),
  z.object({ type: z.literal('reaction.send'), reaction: meetReactionSchema }),
  z.object({
    type: z.literal('room.settings.update'),
    settings: meetRoomSettingsPatchSchema,
    requestId,
  }),
  z.object({
    type: z.literal('room.title.update'),
    requestId,
    title: z.string().trim().min(1).max(255),
  }),
  z.object({ type: z.literal('room.end'), requestId }),
  z.object({
    type: z.literal('admission.forget'),
    userId: participantId,
    requestId,
  }),
  z.object({
    displayName: z
      .string()
      .transform(normalizeDisplayNameText)
      .pipe(z.string().min(1).max(120))
      .optional(),
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
    clientMessageId: z.uuid().optional(),
    attachmentIds: z.array(z.uuid()).max(5).optional(),
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
  z.object({ type: z.literal('presence.resync') }),
  z.object({
    type: z.literal('room.mediaOverride'),
    requestId,
    userId: participantId,
    override: meetMediaOverrideSchema.nullable(),
  }),
  z.object({
    type: z.literal('admission.decideAll'),
    requestId,
    admit: z.boolean(),
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
    requestId,
    type: z.literal('participant.promote'),
    userId: participantId,
  }),
  // Renames the sender only; it carries no target, so nobody renames another.
  z.object({
    displayName: z
      .string()
      .transform(normalizeDisplayNameText)
      .pipe(z.string().min(1).max(120)),
    requestId,
    type: z.literal('participant.rename'),
  }),
  z.object({
    recordingSessionId: z.string().trim().min(1).max(180).optional(),
    requestId,
    state: meetRealtimeRecordingStateSchema,
    type: z.literal('recording.state'),
  }),
  z.object({
    type: z.literal('media.idle'),
    requestId,
    sessionId: z.string().trim().min(1).max(180),
  }),
  z.object({
    requestId,
    sessionDescription: cloudflareSfuSessionDescriptionSchema.optional(),
    type: z.literal('sfu.session.create'),
  }),
  z.object({
    requestId,
    sessionDescription: cloudflareSfuSessionDescriptionSchema,
    sessionId: z.string().trim().min(1).max(180),
    tracks: z.array(cloudflareSfuTrackSchema).min(1).max(256),
    type: z.literal('sfu.tracks.publish'),
  }),
  z.object({
    requestId,
    // Optional by design: when pulling remote tracks the client has no offer
    // to send. Cloudflare replies with an offer, which the client answers via
    // `sfu.renegotiate`. Requiring it here forced callers to send `sdp: ''`,
    // which the schema then rejected as malformed.
    sessionDescription: cloudflareSfuSessionDescriptionSchema.optional(),
    sessionId: z.string().trim().min(1).max(180),
    tracks: z.array(cloudflareSfuTrackSchema).min(1).max(256),
    type: z.literal('sfu.tracks.subscribe'),
  }),
  z.object({
    requestId,
    sessionDescription: cloudflareSfuSessionDescriptionSchema,
    sessionId: z.string().trim().min(1).max(180),
    type: z.literal('sfu.renegotiate'),
  }),
  z.object({
    requestId,
    sessionId: z.string().trim().min(1).max(180),
    tracks: z.array(cloudflareSfuTrackSchema).min(1).max(256),
    force: z.boolean().optional(),
    subscription: z.literal(true).optional(),
    type: z.literal('sfu.tracks.close'),
  }),
  z.object({
    requestId,
    sessionId: z.string().trim().min(1).max(180),
    tracks: z.array(cloudflareSfuTrackSchema).min(1).max(64),
    type: z.literal('sfu.tracks.update'),
  }),
  z.object({
    requestId,
    state: meetRealtimeStreamStateSchema,
    type: z.literal('stream.state'),
  }),
  z.object({
    action: z.enum(['start', 'pause', 'resume', 'stop']),
    durationMs: z
      .number()
      .int()
      .min(60_000)
      .max(180 * 60_000)
      .optional(),
    requestId,
    type: z.literal('classTimer.command'),
  }),
  navigationRequestSchema,
]);

export type MeetRealtimeClientMessage = z.infer<
  typeof meetRealtimeClientMessageSchema
>;

export type MeetRealtimeSfuClientMessage = Extract<
  MeetRealtimeClientMessage,
  { type: `sfu.${string}` }
>;

export type MeetRealtimeRoomTrack = {
  cameraRids?: MeetCameraRid[];
  kind?: string;
  mid?: string;
  sessionId: string;
  trackName?: string;
  userId: string;
};

export type MeetRealtimeServerMessage =
  | LiveActivitiesServerMessage
  | PenboardServerMessage
  | { type: 'qa.snapshot'; snapshot: LiveQaSnapshot; requestId?: string }
  | TranscriptionStateMessage
  | TranscriptionConsentMessage
  | {
      type: 'assistant.live';
      sessionId: string;
      active: boolean;
      ownerId: string;
    }
  | { type: 'assistant.share'; sessionId: string; active: boolean }
  | {
      type: 'assistant.interrupted';
      sessionId: string;
    }
  | {
      type: 'assistant.audio';
      sessionId: string;
      sequence: number;
      data: string;
      at: number;
    }
  | {
      type: 'reaction';
      reaction: MeetReaction;
      userId: string;
      createdAt: string;
    }
  | {
      type: 'navigation';
      mode: MeetNavigationMode;
      /** Sender user id. */
      from: string;
      view?: MeetRoomView;
      /** Hosts and co-hosts move people directly; others ask for consent. */
      forced: boolean;
      createdAt: string;
    }
  | { type: 'room.settings'; settings: MeetRoomSettings }
  | { type: 'room.title.changed'; title: string; requestId?: string }
  | { type: 'room.ended'; by?: string; requestId?: string }
  | { type: 'admission.approved'; participants: MeetApprovedParticipant[] }
  | {
      admission: 'admitted' | 'waiting';
      canManageParticipants?: boolean;
      expiresAt: string;
      roomExpiresAt?: string;
      limits: MeetRealtimeTokenPayload['limits'];
      mode: MeetRealtimeRoomMode;
      role: MeetRealtimeRole;
      classRole?: 'host' | 'cohost' | 'participant';
      classViewersAvailable?: boolean;
      classAttendanceEnabled?: boolean;
      classTimerEnabled?: boolean;
      classTimer?: ClassTimer | null;
      serverNow?: string;
      roomId: string;
      stage: MeetRealtimeStageState;
      type: 'ready';
      mediaCapabilities?: MeetMediaCapability[];
      /** This participant's signed stream ceilings. */
      streamLimits?: MeetStreamEntitlement;
      resumed?: boolean;
      tracks?: MeetRealtimeRoomTrack[];
      userId: string;
    }
  | {
      type: 'classTimer';
      timer: ClassTimer | null;
      serverNow: string;
    }
  | {
      presence: MeetRealtimePresence[];
      seq?: number;
      roomId: string;
      type: 'presence';
    }
  | {
      type: 'presence.delta';
      roomId: string;
      seq: number;
      upserted: MeetRealtimePresence[];
      removed: string[];
    }
  | {
      type: 'admission.bulkResult';
      admitted: number;
      denied: number;
      remaining: number;
      requestId?: string;
    }
  | {
      accountId?: string;
      avatarUrl?: string;
      assistant?: boolean;
      attachmentIds?: string[];
      body: string;
      createdAt: string;
      displayName: string;
      id: string;
      requestId?: string;
      type: 'chat.message';
      replayed?: boolean;
      clientMessageId?: string;
      retained?: boolean;
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
      roomExpiresAt?: string;
      role?: MeetRealtimeRole;
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
      displayName: string;
      requestId?: string;
      type: 'participant.renamed';
      userId: string;
    }
  | {
      ownerDeviceId?: string;
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
      requestId?: string;
      summary: MeetRoomMediaQualitySummary;
      type: 'media.quality.summary';
    }
  | {
      /** Sent when reported stats exceed the entitlement: clamp to it. */
      limits: MeetStreamEntitlement;
      type: 'stream.limits';
    }
  | {
      error: string;
      requestId?: string;
      type: 'error';
    };
