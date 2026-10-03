import { z } from 'zod';
export const CHANNEL_FRAME_BYTES = 3_000_000;
export const channelTopicSchema = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[a-zA-Z0-9:_-]+$/);
export const channelTicketSchema = z
  .object({
    aud: z.literal('tuturuuu.channels'),
    kind: z.enum(['join', 'publish', 'document', 'document-checkpoint']),
    documentId: z.guid().optional(),
    ownerId: z.guid().optional(),
    version: z.number().int().nonnegative().optional(),
    topic: channelTopicSchema,
    userId: z.guid(),
    role: z.enum(['editor', 'viewer']),
    exp: z.number().int().positive(),
  })
  .strict();
export type ChannelTicket = z.infer<typeof channelTicketSchema>;
export interface RealtimeIdentity {
  id: string;
  email?: string;
  user_metadata: {
    full_name?: string;
    display_name?: string;
    avatar_url?: string;
  };
}
export interface RealtimeJoin {
  endpoint: string;
  token: string;
  role?: 'editor' | 'viewer';
  user: RealtimeIdentity;
}
export type RealtimePresenceState<T = Record<string, unknown>> = Record<
  string,
  (T & { presence_ref: string })[]
>;
export type ChannelStatus =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED';
export type ChannelOptions = {
  config?: {
    private?: boolean;
    broadcast?: { self?: boolean; ack?: boolean };
    presence?: { enabled?: boolean; key?: string };
  };
};
export type BroadcastMessage = {
  type: 'broadcast';
  event: string;
  payload: unknown;
};
export type ChannelFrame =
  | BroadcastMessage
  | { type: 'track'; payload: Record<string, unknown> }
  | { type: 'untrack' };

export const channelBroadcastSchema = z
  .object({
    type: z.literal('broadcast'),
    event: z.string().min(1).max(100),
    payload: z.unknown(),
  })
  .strict();
export const channelClientFrameSchema = z.discriminatedUnion('type', [
  channelBroadcastSchema,
  z
    .object({ type: z.literal('authenticate'), token: z.string().max(16384) })
    .strict(),
  z
    .object({
      type: z.literal('track'),
      payload: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z.object({ type: z.literal('untrack') }).strict(),
]);

export const channelServerFrameSchema = z.discriminatedUnion('type', [
  channelBroadcastSchema,
  z
    .object({
      type: z.literal('presence'),
      state: z.record(
        z.string().max(180),
        z
          .array(
            z.object({ presence_ref: z.string().max(64) }).catchall(z.unknown())
          )
          .max(128)
      ),
    })
    .strict(),
]);
