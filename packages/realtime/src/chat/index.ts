import { z } from 'zod';

export const chatRealtimeTokenPayloadSchema = z.object({
  exp: z.number().int().positive(),
  scopes: z.array(z.string().trim().min(1)).default([]),
  userId: z.string().uuid(),
  wsId: z.string().uuid(),
});

export type ChatRealtimeTokenPayload = z.infer<
  typeof chatRealtimeTokenPayloadSchema
>;

const chatRealtimeBaseEventSchema = z.object({
  actorUserId: z.string().uuid().nullable().optional(),
  conversationId: z.string().min(1).nullable().optional(),
  id: z.string().uuid(),
  sentAt: z.string(),
  wsId: z.string().uuid(),
});

export const chatRealtimeEventSchema = z.discriminatedUnion('type', [
  chatRealtimeBaseEventSchema.extend({
    conversation: z.unknown(),
    type: z.literal('conversation.created'),
  }),
  chatRealtimeBaseEventSchema.extend({
    conversation: z.unknown(),
    type: z.literal('conversation.updated'),
  }),
  chatRealtimeBaseEventSchema.extend({
    result: z.unknown(),
    type: z.literal('conversation.deleted'),
  }),
  chatRealtimeBaseEventSchema.extend({
    message: z.unknown(),
    type: z.literal('message.created'),
  }),
  chatRealtimeBaseEventSchema.extend({
    message: z.unknown(),
    type: z.literal('message.updated'),
  }),
  chatRealtimeBaseEventSchema.extend({
    message: z.unknown(),
    type: z.literal('message.deleted'),
  }),
  chatRealtimeBaseEventSchema.extend({
    message: z.unknown(),
    type: z.literal('reaction.updated'),
  }),
  chatRealtimeBaseEventSchema.extend({
    isTyping: z.boolean(),
    type: z.literal('typing.updated'),
  }),
]);

export type ChatRealtimeEvent = z.infer<typeof chatRealtimeEventSchema>;

export type ChatRealtimeServerEvent =
  | {
      type: 'ready';
      userId: string;
      wsId: string;
    }
  | {
      type: 'ping';
      sentAt: string;
    }
  | ChatRealtimeEvent
  | {
      error: string;
      type: 'error';
    };

export function hasChatRealtimeScope(
  token: Pick<ChatRealtimeTokenPayload, 'scopes'>,
  scope: string
) {
  return token.scopes.includes(scope);
}
