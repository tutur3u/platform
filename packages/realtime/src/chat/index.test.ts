import { describe, expect, it } from 'vitest';
import { canReceiveChatRealtimeEvent, chatRealtimeEventSchema } from './index';

const baseEvent = {
  actorUserId: '11111111-1111-4111-8111-111111111111',
  conversationId: 'private-conversation',
  id: '22222222-2222-4222-8222-222222222222',
  sentAt: '2026-05-29T00:00:00.000Z',
  wsId: '33333333-3333-4333-8333-333333333333',
};

describe('chatRealtimeEventSchema', () => {
  it('requires an explicit audience for sensitive chat payload fanout', () => {
    const parsed = chatRealtimeEventSchema.safeParse({
      ...baseEvent,
      message: { content: 'private message' },
      type: 'message.created',
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts user-scoped audiences for private chat payload fanout', () => {
    const parsed = chatRealtimeEventSchema.safeParse({
      ...baseEvent,
      audience: {
        scope: 'users',
        userIds: ['44444444-4444-4444-8444-444444444444'],
      },
      message: { content: 'private message' },
      type: 'message.created',
    });

    expect(parsed.success).toBe(true);
  });
});

describe('canReceiveChatRealtimeEvent', () => {
  it('allows workspace audience events for every subscribed user', () => {
    expect(
      canReceiveChatRealtimeEvent(
        { audience: { scope: 'workspace' } },
        '55555555-5555-4555-8555-555555555555'
      )
    ).toBe(true);
  });

  it('filters user audience events to the intended recipients', () => {
    const event = {
      audience: {
        scope: 'users' as const,
        userIds: ['66666666-6666-4666-8666-666666666666'],
      },
    };

    expect(
      canReceiveChatRealtimeEvent(event, '66666666-6666-4666-8666-666666666666')
    ).toBe(true);
    expect(
      canReceiveChatRealtimeEvent(event, '77777777-7777-4777-8777-777777777777')
    ).toBe(false);
  });
});
