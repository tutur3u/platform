import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  getPermissions: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({
    auth: { getUser: state.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: state.maybeSingle }) }),
      }),
    }),
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: state.getPermissions,
  normalizeWorkspaceId: async (value: string) => value,
}));
vi.mock('./flag', () => ({ isEmailAppealsEnabled: state.enabled }));
vi.mock('next/server', () => ({
  connection: async () => undefined,
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));
import {
  isSameOriginMutation,
  readAppealJson,
  requireAppealAdmin,
} from './http';

const wsId = '11111111-1111-4111-8111-111111111111';
const user = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'staff@tuturuuu.com',
  email_confirmed_at: '2026-11-09T00:00:00Z',
  identities: [{ provider: 'email' }],
};
const request = () =>
  new Request('https://tuturuuu.com/api/v1/workspaces/test/email-appeals');

describe('appeal HTTP boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.getUser.mockResolvedValue({ data: { user }, error: null });
    state.maybeSingle.mockResolvedValue({
      data: { type: 'MEMBER' },
      error: null,
    });
    state.getPermissions.mockResolvedValue({ withoutPermission: () => false });
    state.enabled.mockResolvedValue(true);
  });
  it('admits only verified staff who are workspace member admins with an enabled flag', async () => {
    expect(await requireAppealAdmin(request(), wsId)).toEqual({
      ok: true,
      wsId,
      actorId: user.id,
    });
  });
  it.each([
    'staff@gmail.com',
    'staff@xwf.tuturuuu.com',
    'staff@tuturuuu.com.evil.test',
  ])('refuses %s', async (email) => {
    state.getUser.mockResolvedValue({
      data: { user: { ...user, email } },
      error: null,
    });
    const result = await requireAppealAdmin(request(), wsId);
    expect(result.ok).toBe(false);
    expect(state.getPermissions).not.toHaveBeenCalled();
  });
  it('refuses unconfirmed staff before workspace data access', async () => {
    state.getUser.mockResolvedValue({
      data: { user: { ...user, email_confirmed_at: null } },
      error: null,
    });
    expect((await requireAppealAdmin(request(), wsId)).ok).toBe(false);
    expect(state.maybeSingle).not.toHaveBeenCalled();
  });
  it('refuses a guest and a member without the admin permission', async () => {
    state.maybeSingle.mockResolvedValueOnce({
      data: { type: 'GUEST' },
      error: null,
    });
    expect((await requireAppealAdmin(request(), wsId)).ok).toBe(false);
    state.getPermissions.mockResolvedValueOnce({
      withoutPermission: () => true,
    });
    expect((await requireAppealAdmin(request(), wsId)).ok).toBe(false);
  });
  it('distinguishes a membership lookup outage from a denial', async () => {
    state.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: 'outage' },
    });
    await expect(requireAppealAdmin(request(), wsId)).rejects.toMatchObject({
      code: 'store_unavailable',
      message: 'store_unavailable',
    });
  });
  it('refuses a disabled workspace flag', async () => {
    state.enabled.mockResolvedValue(false);
    expect((await requireAppealAdmin(request(), wsId)).ok).toBe(false);
  });
  it('requires exact Origin and same-origin fetch metadata', () => {
    for (const origin of [
      null,
      'null',
      'https://evil.test',
      'https://mail.tuturuuu.com',
    ]) {
      expect(
        isSameOriginMutation(
          new Request(request(), { headers: origin ? { origin } : {} })
        )
      ).toBe(false);
    }
    expect(
      isSameOriginMutation(
        new Request(request(), { headers: { origin: 'https://tuturuuu.com' } })
      )
    ).toBe(true);
    expect(
      isSameOriginMutation(
        new Request(request(), {
          headers: {
            origin: 'https://tuturuuu.com',
            'sec-fetch-site': 'cross-site',
          },
        })
      )
    ).toBe(false);
  });
  it('bounds the actual streamed body even without Content-Length', async () => {
    const oversized = new Request(request(), {
      method: 'POST',
      headers: { origin: 'https://tuturuuu.com' },
      body: JSON.stringify({ reason: 'x'.repeat(9000) }),
    });
    await expect(readAppealJson(oversized)).rejects.toMatchObject({
      code: 'invalid_request',
      message: 'invalid_request',
    });
  });
});
