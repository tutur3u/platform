import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  access: vi.fn(),
  admin: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: h.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) =>
      handler(request, { supabase: {}, user: { id: 'user-1' } }),
}));
vi.mock('@/legacy-api-routes/v1/notifications/access', () => ({
  buildNotificationAccessFilter: vi.fn(() => 'scope'),
  getNotificationAccessContext: h.access,
}));

import { GET } from '@/legacy-api-routes/v1/notifications/unread-count/route';

const call = (query: string): Promise<Response> =>
  GET(new NextRequest(`https://example.test/x${query}`));

describe('unread-count query validation order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    h.admin.mockResolvedValue({});
    h.access.mockRejectedValue(new Error('lookup failed'));
  });

  it('answers 400 for an invalid workspace id before any access lookup', async () => {
    const response = await call('?wsId=nope');
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'Invalid query parameters',
    });
    expect(h.access).not.toHaveBeenCalled();
    expect(h.admin).not.toHaveBeenCalled();
  });

  it('still answers 500 when the access lookup throws for valid input', async () => {
    const response = await call('');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
