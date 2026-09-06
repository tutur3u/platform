import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  membership: vi.fn(),
  sign: vi.fn(),
  creator: 'host',
}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'workspace',
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('@/lib/meet/realtime-token', () => ({
  getMeetRealtimeUrl: () => 'wss://realtime.example.test',
  signMeetJoinToken: mocks.sign,
}));

import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({
      data: { id: 'meeting', creator_id: 'host', ws_id: 'workspace' },
    }),
  };
  mocks.auth.mockResolvedValue({
    ok: true,
    user: { id: 'guest', email: 'guest@example.test' },
    supabase: { from: () => query },
  });
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.sign.mockImplementation((input) => ({
    expiresAt: new Date(),
    payload: input,
    token: 'signed-token',
  }));
});
describe('call token refresh', () => {
  it('preserves publishing for non-host call participants without granting host', async () => {
    const response = await POST(
      new Request('https://example.test', {
        method: 'POST',
        body: JSON.stringify({ mode: 'call', role: 'host' }),
      }),
      { params: Promise.resolve({ meetingId: 'meeting', wsId: 'workspace' }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.sign).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'speaker', mode: 'call' })
    );
  });
  it.each(['webinar', 'stream'])(
    'keeps non-host %s participants viewer-only',
    async (mode) => {
      await POST(
        new Request('https://example.test', {
          method: 'POST',
          body: JSON.stringify({ mode, role: 'host' }),
        }),
        { params: Promise.resolve({ meetingId: 'meeting', wsId: 'workspace' }) }
      );
      expect(mocks.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'viewer', mode: 'webinar' })
      );
    }
  );
  it('rechecks membership on refresh', async () => {
    mocks.membership.mockResolvedValue({ ok: false });
    const response = await POST(
      new Request('https://example.test', { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ meetingId: 'meeting', wsId: 'workspace' }) }
    );
    expect(response.status).toBe(403);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});

describe('call token input validation', () => {
  it.each(['{', 'null', '[]', '{"mode":"invalid"}', '{"role":"admin"}'])(
    'rejects invalid body %s without minting',
    async (body) => {
      const response = await POST(
        new Request('https://example.test', { method: 'POST', body }),
        {
          params: Promise.resolve({ meetingId: 'meeting', wsId: 'workspace' }),
        }
      );
      expect(response.status).toBe(400);
      expect(mocks.sign).not.toHaveBeenCalled();
    }
  );
});
