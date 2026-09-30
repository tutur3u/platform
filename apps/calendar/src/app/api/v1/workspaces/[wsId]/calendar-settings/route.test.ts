import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  membership: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.membership,
}));

import { GET, PATCH } from './route';

const wsId = '00000000-0000-4000-8000-000000000001';
const params = { params: Promise.resolve({ wsId }) };
const makeRequest = (timezone = 'Asia/Ho_Chi_Minh') =>
  new Request('https://calendar.test/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timezone }),
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  const query = {
    update: mocks.update,
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { timezone: 'Asia/Ho_Chi_Minh' },
      error: null,
    }),
  };
  mocks.update.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  mocks.auth.mockResolvedValue({
    ok: true,
    user: { id: 'verified-user' },
    // This deliberately has no RLS enforcement, like the signed-session client.
    supabase: { rpc: mocks.rpc, from: mocks.from },
  });
});

describe('workspace calendar settings authorization', () => {
  it.each(['auto', 'UTC', 'America/New_York', 'Etc/GMT+7'])(
    'accepts supported timezone %s without rewriting it',
    async (timezone) => {
      expect((await PATCH(makeRequest(timezone), params)).status).toBe(200);
      expect(mocks.update).toHaveBeenCalledWith({ timezone });
    }
  );

  it.each(['', 'Mars/Unknown', '+07:00', ' Asia/Ho_Chi_Minh '])(
    'rejects invalid timezone %s before writing settings',
    async (timezone) => {
      expect((await PATCH(makeRequest(timezone), params)).status).toBe(400);
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );

  it('denies a workspace member without settings permission before any update', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await PATCH(makeRequest(), params)).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('fails closed when permission lookup fails or returns no decision', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'unavailable' },
    });
    expect((await PATCH(makeRequest(), params)).status).toBe(500);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect((await PATCH(makeRequest(), params)).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('checks the verified principal and exact workspace before an allowed update', async () => {
    const response = await PATCH(makeRequest(), params);
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('has_workspace_permission', {
      p_user_id: 'verified-user',
      p_ws_id: wsId,
      p_permission: 'manage_workspace_settings',
    });
    expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request), {
      allowAppSessionAuth: true,
    });
    expect(mocks.update).toHaveBeenCalledWith({ timezone: 'Asia/Ho_Chi_Minh' });
  });

  it('denies missing membership before permission lookup', async () => {
    mocks.membership.mockResolvedValue({ ok: false });
    expect((await PATCH(makeRequest(), params)).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('does not write when authentication fails', async () => {
    mocks.auth.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    });
    expect((await PATCH(makeRequest(), params)).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('keeps member read access independent of edit permission', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(
      (
        await GET(
          new Request('https://calendar.test/settings') as never,
          params
        )
      ).status
    ).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
