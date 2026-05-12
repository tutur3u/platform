import { afterEach, describe, expect, it } from 'vitest';
import { signHiveRealtimeToken, verifyHiveRealtimeToken } from './_shared';

describe('Hive realtime token signing', () => {
  afterEach(() => {
    delete process.env.HIVE_REALTIME_TOKEN_SECRET;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it('uses the platform Supabase service secret when the Hive secret is not set', () => {
    process.env.SUPABASE_SECRET_KEY = 'supabase-service-secret';

    const token = signHiveRealtimeToken({
      exp: 2_000_000_000,
      role: 'member',
      scopes: ['presence'],
      serverId: '8f7fa5cf-8bb1-446a-9c51-f4222f452f4d',
      userId: '00000000-0000-4000-8000-000000000001',
    });

    expect(verifyHiveRealtimeToken(token)).toMatchObject({
      serverId: '8f7fa5cf-8bb1-446a-9c51-f4222f452f4d',
      userId: '00000000-0000-4000-8000-000000000001',
    });
  });
});
