import { z } from 'zod';

const chatRealtimeUuidSchema = z.string().uuid();

export const chatRealtimeTokenPayloadSchema = z.object({
  exp: z.number().int().positive(),
  scopes: z.array(z.string().trim().min(1)).default([]),
  userId: chatRealtimeUuidSchema,
  wsId: chatRealtimeUuidSchema,
});

export type ChatRealtimeTokenPayload = z.infer<
  typeof chatRealtimeTokenPayloadSchema
>;

const chatRealtimeAudienceSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('workspace') }),
  z.object({
    scope: z.literal('users'),
    userIds: z.array(chatRealtimeUuidSchema).min(1),
  }),
]);

export type ChatRealtimeAudience = z.infer<typeof chatRealtimeAudienceSchema>;

const chatRealtimeBaseEventSchema = z.object({
  actorUserId: chatRealtimeUuidSchema.nullable().optional(),
  audience: chatRealtimeAudienceSchema,
  conversationId: z.string().min(1).nullable().optional(),
  id: chatRealtimeUuidSchema,
  sentAt: z.string(),
  wsId: chatRealtimeUuidSchema,
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

export function canReceiveChatRealtimeEvent(
  event: Pick<ChatRealtimeEvent, 'audience'>,
  userId: string
) {
  if (event.audience.scope === 'workspace') return true;

  return event.audience.userIds.includes(userId);
}
