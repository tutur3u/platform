import { z } from 'zod';

export const meetRealtimeRoleSchema = z.enum(['host', 'speaker', 'viewer']);
export const meetRealtimeRoomModeSchema = z.enum(['call', 'webinar', 'stream']);
export const meetRealtimeTrackKindSchema = z.enum(['audio', 'video', 'screen']);

export type MeetRealtimeRole = z.infer<typeof meetRealtimeRoleSchema>;
export type MeetRealtimeRoomMode = z.infer<typeof meetRealtimeRoomModeSchema>;
export type MeetRealtimeTrackKind = z.infer<typeof meetRealtimeTrackKindSchema>;

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

const meetMediaStateSchema = z
  .object({
    audioEnabled: z.boolean().default(false),
    screenEnabled: z.boolean().default(false),
    videoEnabled: z.boolean().default(false),
  })
  .default(DEFAULT_MEDIA_STATE);

const meetVideoLimitsSchema = z
  .object({
    defaultCameraEnabled: z.boolean().default(false),
    maxFrameRate: z.number().int().min(1).max(60).default(24),
    maxHeight: z.number().int().min(180).max(2160).default(720),
    maxWidth: z.number().int().min(320).max(3840).default(1280),
  })
  .default(DEFAULT_VIDEO_LIMITS);

const meetRoomLimitsSchema = z
  .object({
    maxPublishers: z.number().int().min(1).max(128).default(8),
    maxViewers: z.number().int().min(1).max(10_000).default(96),
    video: meetVideoLimitsSchema,
  })
  .default(DEFAULT_ROOM_LIMITS);

export const meetRealtimeTokenPayloadSchema = z.object({
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

export const cloudflareSfuTrackSchema = z.object({
  kind: meetRealtimeTrackKindSchema.optional(),
  location: z.string().optional(),
  mid: z.string().optional(),
  sessionId: z.string().optional(),
  trackName: z.string().optional(),
});

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
    requestId: z.string().trim().min(1).max(120).optional(),
    type: z.literal('chat.message'),
  }),
  z.object({
    requestId: z.string().trim().min(1).max(120).optional(),
    stage: meetRealtimeStageStateSchema,
    type: z.literal('stage.update'),
  }),
  z.object({
    requestId: z.string().trim().min(1).max(120).optional(),
    sessionDescription: cloudflareSfuSessionDescriptionSchema.optional(),
    type: z.literal('sfu.session.create'),
  }),
  z.object({
    requestId: z.string().trim().min(1).max(120).optional(),
    sessionDescription: cloudflareSfuSessionDescriptionSchema,
    sessionId: z.string().trim().min(1),
    tracks: z.array(cloudflareSfuTrackSchema).min(1),
    type: z.literal('sfu.tracks.publish'),
  }),
  z.object({
    requestId: z.string().trim().min(1).max(120).optional(),
    sessionDescription: cloudflareSfuSessionDescriptionSchema,
    sessionId: z.string().trim().min(1),
    tracks: z.array(cloudflareSfuTrackSchema).min(1),
    type: z.literal('sfu.tracks.subscribe'),
  }),
  z.object({
    requestId: z.string().trim().min(1).max(120).optional(),
    sessionDescription: cloudflareSfuSessionDescriptionSchema,
    sessionId: z.string().trim().min(1),
    type: z.literal('sfu.renegotiate'),
  }),
  z.object({
    requestId: z.string().trim().min(1).max(120).optional(),
    sessionId: z.string().trim().min(1),
    tracks: z.array(cloudflareSfuTrackSchema).min(1),
    type: z.literal('sfu.tracks.close'),
  }),
  z.object({
    requestId: z.string().trim().min(1).max(120).optional(),
    state: z.enum(['idle', 'starting', 'live', 'stopping', 'ended', 'error']),
    type: z.literal('stream.state'),
  }),
]);

export type MeetRealtimeClientMessage = z.infer<
  typeof meetRealtimeClientMessageSchema
>;

export type MeetRealtimeServerMessage =
  | {
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
      action: MeetRealtimeClientMessage['type'];
      requestId?: string;
      result: unknown;
      type: 'sfu.response';
    }
  | {
      requestId?: string;
      sessionId: string;
      tracks: Array<z.infer<typeof cloudflareSfuTrackSchema>>;
      type: 'track.published' | 'track.closed';
      userId: string;
    }
  | {
      requestId?: string;
      state: 'idle' | 'starting' | 'live' | 'stopping' | 'ended' | 'error';
      type: 'stream.state';
    }
  | {
      error: string;
      requestId?: string;
      type: 'error';
    };

export function hasMeetRealtimeScope(
  token: Pick<MeetRealtimeTokenPayload, 'role' | 'scopes'>,
  scope: string
) {
  return token.role === 'host' || token.scopes.includes(scope);
}

export function canMeetRealtimePublish(
  token: Pick<MeetRealtimeTokenPayload, 'mode' | 'role' | 'scopes'>,
  _kind: MeetRealtimeTrackKind
) {
  if (!hasMeetRealtimeScope(token, 'sfu:publish')) {
    return false;
  }

  if (token.role === 'viewer') {
    return false;
  }

  return token.mode !== 'stream' || token.role === 'host';
}

export function canMeetRealtimeUpdateStage(
  token: Pick<MeetRealtimeTokenPayload, 'role' | 'scopes'>
) {
  return hasMeetRealtimeScope(token, 'stage:write');
}
