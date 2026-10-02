import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  rpc: vi.fn(),
  admin: vi.fn(),
  read: vi.fn(),
  actor: 'resolved-actor',
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: f.admin,
}));
vi.mock('next/server', async () => ({
  ...(await vi.importActual('next/server')),
  connection: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        req: Request,
        context: { user: { id: string }; supabase: { from: typeof f.read } }
      ) => Promise<Response>
    ) =>
    (req: Request) =>
      handler(req, { user: { id: f.actor }, supabase: { from: f.read } }),
}));

import { PATCH } from './route';

const request = (body: unknown) =>
  new Request('https://example.test/api/v1/users/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
beforeEach(() => {
  vi.clearAllMocks();
  f.admin.mockResolvedValue({ rpc: f.rpc });
  f.rpc.mockResolvedValue({ error: null });
});
describe('Canonical profile API', () => {
  it('uses the authenticated actor and atomically reserves normalized usernames', async () => {
    const response = await PATCH(
      request({
        handle: ' Creator_Name ',
        banner_url: 'https://example.test/banner.png',
        user_id: 'forged-actor',
        email: 'private@example.test',
      }),
      undefined as never
    );
    expect(response.status).toBe(200);
    expect(f.rpc).toHaveBeenCalledWith('update_public_user_profile', {
      p_user_id: f.actor,
      p_patch: {
        handle: 'creator_name',
        banner_url: 'https://example.test/banner.png',
      },
    });
  });
  it('supports explicit clearing and reports conflicts without retrying a partial write', async () => {
    await PATCH(
      request({ handle: null, banner_url: null }),
      undefined as never
    );
    expect(f.rpc).toHaveBeenCalledWith('update_public_user_profile', {
      p_user_id: f.actor,
      p_patch: { handle: null, banner_url: null },
    });
    f.rpc.mockResolvedValue({ error: { code: '23505' } });
    expect(
      (await PATCH(request({ handle: 'someone_else' }), undefined as never))
        .status
    ).toBe(409);
    expect(f.read).not.toHaveBeenCalled();
  });
  it.each([
    { handle: '_invalid' },
    { handle: 'ab' },
    { handle: 'four' },
    { handle: 'google' },
    { handle: 'apple' },
    { handle: 'microsoft' },
    { handle: 'support' },
    { banner_url: 'javascript:alert(1)' },
    { banner_url: 'https://' },
    { avatar_url: 'https://' },
    { avatar_url: 'http://example.test/image.png' },
    { bio: 'x'.repeat(1001) },
  ])(
    'rejects invalid public identity before touching the database: %j',
    async (body) => {
      expect((await PATCH(request(body), undefined as never)).status).toBe(400);
      expect(f.rpc).not.toHaveBeenCalled();
    }
  );
  it('fails visibly when the identity migration is pending', async () => {
    f.rpc.mockResolvedValue({ error: { code: 'PGRST202' } });
    expect(
      (await PATCH(request({ handle: 'quiet_creator' }), undefined as never))
        .status
    ).toBe(503);
    expect(f.read).not.toHaveBeenCalled();
  });
  it.each(['username_change_cooldown', 'display_name_change_limit'])(
    'returns a bounded retry window for %s without fallback writes',
    async (hint) => {
      f.rpc.mockResolvedValue({
        error: { code: 'PT429', hint, details: '3600' },
      });
      const response = await PATCH(
        request({ display_name: 'New name' }),
        undefined as never
      );
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('3600');
      expect(await response.json()).toMatchObject({
        code: hint,
        retryAfter: 3600,
      });
      expect(f.read).not.toHaveBeenCalled();
    }
  );
  it('requires the policy migration for display-name changes', async () => {
    f.rpc.mockResolvedValue({ error: { code: 'PGRST202' } });
    expect(
      (await PATCH(request({ display_name: 'New name' }), undefined as never))
        .status
    ).toBe(503);
    expect(f.read).not.toHaveBeenCalled();
  });
  it('preserves biography editing before the additive RPC arrives', async () => {
    f.rpc.mockResolvedValue({ error: { code: 'PGRST202' } });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    f.read.mockReturnValue({ update });
    expect(
      (await PATCH(request({ bio: 'Synthetic biography' }), undefined as never))
        .status
    ).toBe(200);
    expect(update).toHaveBeenCalledWith({ bio: 'Synthetic biography' });
    expect(eq).toHaveBeenCalledWith('id', f.actor);
  });
});
