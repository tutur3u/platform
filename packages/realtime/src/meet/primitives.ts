import { z } from 'zod';
import { MEET_CAMERA_RID_VALUES } from './simulcast-layers';
import { meetStreamEntitlementSchema } from './stream-tiers';

export const meetRealtimeRoleSchema = z.enum(['host', 'speaker', 'viewer']);
export const meetRealtimeRoomModeSchema = z.enum(['call', 'webinar', 'stream']);
export const meetRealtimeTrackKindSchema = z.enum([
  'audio',
  'video',
  'screen',
  'screen_audio',
]);

export type MeetRealtimeRole = z.infer<typeof meetRealtimeRoleSchema>;
export type MeetRealtimeRoomMode = z.infer<typeof meetRealtimeRoomModeSchema>;
export type MeetRealtimeTrackKind = z.infer<typeof meetRealtimeTrackKindSchema>;

/**
 * Whether a joining participant is admitted straight into the room or has to
 * wait for a host. Mirrors Google Meet's "ask to join" behaviour for anyone who
 * is not a workspace member of the meeting's workspace.
 */
export const meetRealtimeAdmissionSchema = z.enum(['open', 'lobby']);
export type MeetRealtimeAdmission = z.infer<typeof meetRealtimeAdmissionSchema>;

export const meetRealtimeRecordingStateSchema = z.enum([
  'idle',
  'starting',
  'recording',
  'stopping',
  'error',
]);
export type MeetRealtimeRecordingState = z.infer<
  typeof meetRealtimeRecordingStateSchema
>;

export const meetRealtimeStreamStateSchema = z.enum([
  'idle',
  'starting',
  'live',
  'stopping',
  'ended',
  'error',
]);
export type MeetRealtimeStreamState = z.infer<
  typeof meetRealtimeStreamStateSchema
>;

const DEFAULT_MEDIA_STATE = {
  audioEnabled: false,
  screenEnabled: false,
  videoEnabled: false,
};

const DEFAULT_VIDEO_LIMITS = {
  defaultCameraEnabled: false,
  maxFrameRate: 24,
  maxHeight: 720,
  maxWidth: 1280,
};

const DEFAULT_ROOM_LIMITS = {
  maxPublishers: 8,
  maxViewers: 96,
  video: DEFAULT_VIDEO_LIMITS,
};

const DEFAULT_STAGE_STATE = {
  activeSpeakerIds: [],
  hostUserId: null,
  locked: false,
  raisedHandUserIds: [],
};

export const meetMediaStateSchema = z
  .object({
    audioEnabled: z.boolean().default(false),
    screenEnabled: z.boolean().default(false),
    videoEnabled: z.boolean().default(false),
  })
  .default(DEFAULT_MEDIA_STATE);

export type MeetMediaState = z.infer<typeof meetMediaStateSchema>;

export const meetVideoLimitsSchema = z
  .object({
    defaultCameraEnabled: z.boolean().default(false),
    maxFrameRate: z.number().int().min(1).max(60).default(24),
    maxHeight: z.number().int().min(180).max(2160).default(720),
    maxWidth: z.number().int().min(320).max(3840).default(1280),
  })
  .default(DEFAULT_VIDEO_LIMITS);

export const meetRoomLimitsSchema = z
  .object({
    maxRoomDurationSeconds: z.number().int().min(7200).max(86400).optional(),
    maxParticipants: z.number().int().min(1).max(100).optional(),
    maxPublishers: z.number().int().min(1).max(128).default(8),
    maxViewers: z.number().int().min(1).max(10_000).default(96),
    /** Signed per-participant stream ceilings; absent means the free tier. */
    stream: meetStreamEntitlementSchema.optional(),
    video: meetVideoLimitsSchema,
  })
  .default(DEFAULT_ROOM_LIMITS);

export const meetRealtimeTokenPayloadSchema = z.object({
  accountId: z.uuid().optional(),
  /** An anonymous guest without a Tuturuuu account. */
  guest: z.literal(true).optional(),
  /** Set on room-service tokens issued from a verified guest cookie. */
  guestTurnstileVerified: z.literal(true).optional(),
  admission: meetRealtimeAdmissionSchema.default('open'),
  avatarUrl: z
    .url()
    .max(2048)
    .refine((value) => value.startsWith('https://'))
    .optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  /** Account members are recorded by user id. Guests are recorded by guest id. */
  participantKind: z.enum(['member', 'guest']).optional(),
  exp: z.number().int().positive(),
  limits: meetRoomLimitsSchema,
  meetingApp: z.enum(['meet', 'parley']).optional(),
  meetingId: z.string().uuid(),
  mode: meetRealtimeRoomModeSchema.default('call'),
  role: meetRealtimeRoleSchema,
  roomId: z.string().trim().min(1).max(180),
  scopes: z.array(z.string().trim().min(1)).default([]),
  userId: z.string().uuid(),
  wsId: z.string().uuid(),
});

export type MeetRealtimeTokenPayload = z.infer<
  typeof meetRealtimeTokenPayloadSchema
>;

export const meetAssistantAudioSchema = z.object({
  sessionId: z.uuid().optional(),
  microphoneEnabled: z.boolean(),
  speakerEnabled: z.boolean(),
});

export const meetRealtimePresenceSchema = z.object({
  canManageParticipants: z.boolean().optional(),
  miraPrivate: z.boolean().optional(),
  assistantAudio: meetAssistantAudioSchema.optional(),
  accountId: z.uuid().optional(),
  guest: z.literal(true).optional(),
  avatarUrl: z
    .url()
    .max(2048)
    .refine((value) => value.startsWith('https://'))
    .optional(),
  displayName: z.string().trim().min(1).max(120),
  joinedAt: z.string(),
  lastSeenAt: z.string(),
  media: meetMediaStateSchema,
  nonClassMedia: z.boolean().optional(),
  role: meetRealtimeRoleSchema,
  userId: z.string().uuid(),
});

export type MeetRealtimePresence = z.infer<typeof meetRealtimePresenceSchema>;

export const meetRealtimeWaitingParticipantSchema = z.object({
  canManageParticipants: z.boolean().optional(),
  accountId: z.uuid().optional(),
  guest: z.literal(true).optional(),
  /** An anonymous guest whose join request did not pass Turnstile. */
  unverified: z.literal(true).optional(),
  /** An anonymous guest whose join request passed a human check. */
  verified: z.literal(true).optional(),
  avatarUrl: z
    .url()
    .max(2048)
    .refine((value) => value.startsWith('https://'))
    .optional(),
  displayName: z.string().trim().min(1).max(120),
  participantKind: z.enum(['member', 'guest']).optional(),
  nonClassMedia: z.boolean().optional(),
  role: z.enum(['viewer', 'speaker']).optional(),
  requestedAt: z.string(),
  userId: z.string().uuid(),
});

export type MeetRealtimeWaitingParticipant = z.infer<
  typeof meetRealtimeWaitingParticipantSchema
>;

export const meetRealtimeStageStateSchema = z
  .object({
    activeSpeakerIds: z.array(z.string().uuid()).default([]),
    hostUserId: z.string().uuid().nullable().default(null),
    locked: z.boolean().default(false),
    raisedHandUserIds: z.array(z.string().uuid()).default([]),
  })
  .default(DEFAULT_STAGE_STATE);

export type MeetRealtimeStageState = z.infer<
  typeof meetRealtimeStageStateSchema
>;

export const cloudflareSfuSessionDescriptionSchema = z.object({
  sdp: z.string().min(1),
  type: z.enum(['offer', 'answer']),
});

export type CloudflareSfuSessionDescription = z.infer<
  typeof cloudflareSfuSessionDescriptionSchema
>;

export const cloudflareSfuTrackSchema = z.object({
  kind: meetRealtimeTrackKindSchema.optional(),
  location: z.string().optional(),
  mid: z.string().optional(),
  sessionId: z.string().optional(),
  simulcast: z
    .object({
      preferredRid: z.enum(MEET_CAMERA_RID_VALUES),
      priorityOrdering: z.enum(['none', 'asciibetical']),
      ridNotAvailable: z.enum(['none', 'asciibetical']),
    })
    .optional(),
  trackName: z.string().optional(),
});

export type CloudflareSfuTrack = z.infer<typeof cloudflareSfuTrackSchema>;
