import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyHiveRealtimeToken } from '../src/token';

function sign(payload: Record<string, unknown>, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload))
    .toString('base64')
    .replace(/=/gu, '')
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_');
  const signature = createHmac('sha256', secret)
    .update(encoded)
    .digest('base64')
    .replace(/=/gu, '')
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_');

  return `${encoded}.${signature}`;
}

describe('Hive realtime token validation', () => {
  it('accepts valid scoped tokens', () => {
    const token = sign(
      {
        exp: 2_000_000_000,
        role: 'member',
        scopes: ['world:event'],
        serverId: '8f7fa5cf-8bb1-446a-9c51-f4222f452f4d',
        userId: '00000000-0000-4000-8000-000000000001',
      },
      'secret'
    );

    expect(verifyHiveRealtimeToken(token, 'secret', 1_000)).toMatchObject({
      role: 'member',
      serverId: '8f7fa5cf-8bb1-446a-9c51-f4222f452f4d',
    });
  });

  it('rejects expired or tampered tokens', () => {
    const token = sign(
      {
        exp: 10,
        role: 'member',
        scopes: [],
        serverId: '8f7fa5cf-8bb1-446a-9c51-f4222f452f4d',
        userId: '00000000-0000-4000-8000-000000000001',
      },
      'secret'
    );

    expect(verifyHiveRealtimeToken(token, 'secret', 20_000)).toBeNull();
    expect(verifyHiveRealtimeToken(`${token}x`, 'secret', 1_000)).toBeNull();
  });
});
