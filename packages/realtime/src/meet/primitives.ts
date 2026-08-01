import { z } from 'zod';

export const meetRealtimeRoleSchema = z.enum(['host', 'speaker', 'viewer']);
export const meetRealtimeRoomModeSchema = z.enum(['call', 'webinar', 'stream']);
export const meetRealtimeTrackKindSchema = z.enum(['audio', 'video', 'screen']);

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
    maxPublishers: z.number().int().min(1).max(128).default(8),
    maxViewers: z.number().int().min(1).max(10_000).default(96),
    video: meetVideoLimitsSchema,
  })
  .default(DEFAULT_ROOM_LIMITS);

export const meetRealtimeTokenPayloadSchema = z.object({
  admission: meetRealtimeAdmissionSchema.default('open'),
  displayName: z.string().trim().min(1).max(120).optional(),
  exp: z.number().int().positive(),
  limits: meetRoomLimitsSchema,
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

export const meetRealtimePresenceSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  joinedAt: z.string(),
  lastSeenAt: z.string(),
  media: meetMediaStateSchema,
  role: meetRealtimeRoleSchema,
  userId: z.string().uuid(),
});

export type MeetRealtimePresence = z.infer<typeof meetRealtimePresenceSchema>;

export const meetRealtimeWaitingParticipantSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
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
  trackName: z.string().optional(),
});

export type CloudflareSfuTrack = z.infer<typeof cloudflareSfuTrackSchema>;
