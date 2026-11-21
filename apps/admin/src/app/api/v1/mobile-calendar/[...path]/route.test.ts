// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUser, loadSecret } = vi.hoisted(() => ({
  getUser: vi.fn(),
  loadSecret: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => ({ auth: { getUser } })),
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@/lib/mobile-calendar/secret', () => ({
  loadCalendarGatewaySecret: loadSecret,
}));

import { GET } from './route';

beforeEach(() => vi.clearAllMocks());

describe('Calendar gateway session verification', () => {
  it.each([0, 500, 503])(
    'reports an auth service outage (%s) as unavailable',
    async (status) => {
      getUser.mockResolvedValue({ data: { user: null }, error: { status } });
      const response = await GET(
        new Request(
          'https://infrastructure.tuturuuu.com/api/v1/mobile-calendar/api/v1/calendar/connections',
          { headers: { Authorization: 'Bearer session-to-verify' } }
        )
      );
      expect(getUser).toHaveBeenCalledWith('session-to-verify');
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(loadSecret).not.toHaveBeenCalled();
    }
  );

  it('rejects invalid tokens even when a browser cookie is supplied', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    const response = await GET(
      new Request(
        'https://infrastructure.tuturuuu.com/api/v1/mobile-calendar/api/v1/calendar/connections',
        {
          headers: {
            Authorization: 'Bearer forged',
            Cookie: 'session=valid-cookie',
          },
        }
      )
    );
    expect(getUser).toHaveBeenCalledWith('forged');
    expect(response.status).toBe(401);
    expect(loadSecret).not.toHaveBeenCalled();
  });
});
