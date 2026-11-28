import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { POST } from './route';

describe('send-immediate bearer authorization', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects SUPABASE_SECRET_KEY as a bearer token', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('CRON_CONTROL_DELIVERY_TOKEN', 'delivery-secret');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'service-role-secret');

    const response = await POST(
      new Request('http://localhost/api/notifications/send-immediate', {
        headers: { authorization: 'Bearer service-role-secret' },
        method: 'POST',
      }) as never
    );

    expect(response.status).toBe(401);
  });
});
