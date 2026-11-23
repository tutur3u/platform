import { describe, expect, it } from 'vitest';
import { signChatRealtimeToken, verifyChatRealtimeToken } from './token';

const SECRET = 'test-only-legacy-chat-realtime-secret-0123';

describe('Chat realtime token', () => {
  it('round-trips signed workspace chat realtime scopes', () => {
    const token = signChatRealtimeToken(
      {
        exp: Math.floor(Date.now() / 1000) + 60,
        scopes: ['subscribe', 'publish'],
        userId: '00000000-0000-4000-8000-000000000001',
        wsId: '00000000-0000-4000-8000-000000000002',
      },
      SECRET
    );

    expect(verifyChatRealtimeToken(token, SECRET)).toEqual(
      expect.objectContaining({
        scopes: ['subscribe', 'publish'],
        userId: '00000000-0000-4000-8000-000000000001',
        wsId: '00000000-0000-4000-8000-000000000002',
      })
    );
    expect(verifyChatRealtimeToken(token, `${SECRET}-wrong`)).toBeNull();
  });

  it('refuses short secrets and malformed tokens', () => {
    const payload = {
      exp: Math.floor(Date.now() / 1000) + 60,
      userId: '00000000-0000-4000-8000-000000000001',
      wsId: '00000000-0000-4000-8000-000000000002',
    };
    expect(() => signChatRealtimeToken(payload, 'short')).toThrow(/at least/u);
    const token = signChatRealtimeToken(payload, SECRET);
    for (const bad of [`${token}.extra`, `${token}!`, `.${token}`]) {
      expect(verifyChatRealtimeToken(bad, SECRET)).toBeNull();
    }
  });
});
