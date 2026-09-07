import { MeetAiGenerationError } from '@tuturuuu/ai/meetings/failure';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  membership: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.user,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async (id: string) => id,
  verifyWorkspaceMembershipType: mocks.membership,
}));

import { meetAiAccess, meetAiResponse } from './access';

const params = {
  params: Promise.resolve({
    wsId: 'workspace',
    meetingId: '00000000-0000-4000-8000-000000000001',
  }),
};
const request = (origin = 'https://meet.tuturuuu.com') =>
  new Request(
    'https://meet.tuturuuu.com/api/meet-ai/workspace/00000000-0000-4000-8000-000000000001',
    { method: 'POST', headers: { origin } }
  );
describe('Meet AI satellite authorization', () => {
  beforeEach(() => vi.resetAllMocks());
  it('returns a configuration status separately from upstream failures', async () => {
    const response = await meetAiResponse(async () => {
      throw new MeetAiGenerationError('missing_configuration');
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Meeting AI is not configured',
    });
  });
  it('returns a safe upstream status for provider failures', async () => {
    const response = await meetAiResponse(async () => {
      throw new MeetAiGenerationError();
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Meeting AI provider request failed',
    });
  });
  it('rejects cross-origin spending before resolving identity', async () => {
    const response = await meetAiResponse(() =>
      meetAiAccess(request('https://evil.example'), params, true)
    );
    expect(response.status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it('requires a signed-in satellite actor', async () => {
    mocks.user.mockResolvedValue(null);
    expect(
      (await meetAiResponse(() => meetAiAccess(request(), params))).status
    ).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each([
    ['membership_missing', 403],
    ['membership_lookup_failed', 500],
  ])('handles %s without querying meeting data', async (error, status) => {
    const from = vi.fn();
    mocks.admin.mockResolvedValue({ from });
    mocks.user.mockResolvedValue({ id: 'actor' });
    mocks.membership.mockResolvedValue({ ok: false, error });
    expect(
      (await meetAiResponse(() => meetAiAccess(request(), params))).status
    ).toBe(status);
    expect(from).not.toHaveBeenCalled();
  });
  it('allows member reads but reserves mutations for the creator', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'meeting', creator_id: 'other' },
        error: null,
      }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.admin.mockResolvedValue({ from: () => query });
    mocks.user.mockResolvedValue({ id: 'actor' });
    mocks.membership.mockResolvedValue({ ok: true });
    expect((await meetAiAccess(request(), params)).canManage).toBe(false);
    expect(
      (await meetAiResponse(() => meetAiAccess(request(), params, true))).status
    ).toBe(403);
    expect(query.eq).toHaveBeenCalledWith('ws_id', 'workspace');
  });
});
