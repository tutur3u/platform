import { describe, expect, it } from 'vitest';
import { signChatRealtimeToken, verifyChatRealtimeToken } from './token';

describe('Chat realtime token', () => {
  it('round-trips signed workspace chat realtime scopes', () => {
    const token = signChatRealtimeToken(
      {
        exp: Math.floor(Date.now() / 1000) + 60,
        scopes: ['subscribe', 'publish'],
        userId: '00000000-0000-4000-8000-000000000001',
        wsId: '00000000-0000-4000-8000-000000000002',
      },
      'test-secret'
    );

    expect(verifyChatRealtimeToken(token, 'test-secret')).toEqual(
      expect.objectContaining({
        scopes: ['subscribe', 'publish'],
        userId: '00000000-0000-4000-8000-000000000001',
        wsId: '00000000-0000-4000-8000-000000000002',
      })
    );
    expect(verifyChatRealtimeToken(token, 'wrong-secret')).toBeNull();
  });
});
