vi.mock('@tuturuuu/meet-core/parley/repository', () => ({
  isParleySession: async () => false,
}));

import { MeetAiGenerationError } from '@tuturuuu/ai/meetings/failure';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cloudflare: vi.fn(),
  user: vi.fn(),
  membership: vi.fn(),
  admin: vi.fn(),
  shared: vi.fn(),
  resolve: vi.fn(
    async ({
      wsId,
    }: {
      wsId: string;
      principal: { id: string; email: string | null };
    }) => (wsId === 'personal' ? 'workspace' : wsId)
  ),
}));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.cloudflare,
}));
const bindAllowlist = (value?: string) =>
  mocks.cloudflare.mockResolvedValue({
    env: {
      MEET_AI_ENABLED_WORKSPACE_IDS: value,
      MEET_AI_DISABLED: value ? undefined : 'true',
    },
  });
vi.mock('./room-access', () => ({ canReadSharedMeetingNotes: mocks.shared }));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.user,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  resolveWorkspaceIdForPrincipal: mocks.resolve,
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
  beforeEach(() => {
    vi.resetAllMocks();
    bindAllowlist('workspace');
    mocks.resolve.mockImplementation(async ({ wsId }) =>
      wsId === 'personal' ? 'workspace' : wsId
    );
  });
  it('returns a configuration status separately from upstream failures', async () => {
    const response = await meetAiResponse(async () => {
      throw new MeetAiGenerationError('missing_configuration');
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: 'MEET_AI_NOT_CONFIGURED',
      error: 'Meeting AI is not configured',
    });
  });
  it('returns a safe upstream status for provider failures', async () => {
    const response = await meetAiResponse(async () => {
      throw new MeetAiGenerationError();
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      code: 'MEET_AI_PROVIDER_UNAVAILABLE',
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
  describe('pilot workspace allowlist', () => {
    const allowed = '00000000-0000-4000-8000-0000000000aa';
    const denied = '00000000-0000-4000-8000-0000000000bb';
    const forWorkspace = (wsId: string) => ({
      params: Promise.resolve({
        wsId,
        meetingId: '00000000-0000-4000-8000-000000000001',
      }),
    });
    const signedInHost = () => {
      const query = {
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'meeting', creator_id: 'actor' },
          error: null,
        }),
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      mocks.admin.mockResolvedValue({ from: () => query });
      mocks.user.mockResolvedValue({ id: 'actor' });
      mocks.membership.mockResolvedValue({ ok: true });
    };
    it('denies every workspace when the kill switch is set', async () => {
      bindAllowlist('');
      signedInHost();
      const response = await meetAiResponse(() =>
        meetAiAccess(request(), forWorkspace(allowed), true)
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        code: 'MEET_AI_WORKSPACE_NOT_ENABLED',
        error: 'Meet AI is temporarily unavailable',
      });
    });
    it('denies an unlisted workspace and allows a listed one', async () => {
      bindAllowlist(allowed);
      signedInHost();
      expect(
        (
          await meetAiResponse(() =>
            meetAiAccess(request(), forWorkspace(denied), true)
          )
        ).status
      ).toBe(403);
      const access = await meetAiAccess(request(), forWorkspace(allowed), true);
      expect(access.wsId).toBe(allowed);
    });
    it('denies with the injected kill switch even if ambient process.env lists the workspace', async () => {
      vi.stubEnv('MEET_AI_ENABLED_WORKSPACE_IDS', allowed);
      bindAllowlist(undefined);
      signedInHost();
      const response = await meetAiResponse(() =>
        meetAiAccess(request(), forWorkspace(allowed), true)
      );
      expect(response.status).toBe(403);
      vi.unstubAllEnvs();
    });
    it('checks the allowlist against the resolved workspace for personal and handle lookups', async () => {
      bindAllowlist(allowed);
      signedInHost();
      mocks.resolve.mockImplementation(async ({ wsId }) =>
        wsId === 'personal' ? allowed : denied
      );
      expect(
        (await meetAiAccess(request(), forWorkspace('personal'), true)).wsId
      ).toBe(allowed);
      // A raw value that happens to be listed does not admit a different workspace.
      expect(
        (
          await meetAiResponse(() =>
            meetAiAccess(request(), forWorkspace(allowed), true)
          )
        ).status
      ).toBe(403);
      expect(
        (
          await meetAiResponse(() =>
            meetAiAccess(request(), forWorkspace('team-handle'), true)
          )
        ).status
      ).toBe(403);
    });
    it('keeps reads of existing notes available for unlisted workspaces', async () => {
      bindAllowlist(allowed);
      signedInHost();
      expect((await meetAiAccess(request(), forWorkspace(denied))).wsId).toBe(
        denied
      );
    });
  });
  it('requires a signed-in satellite actor', async () => {
    mocks.user.mockResolvedValue(null);
    expect(
      (await meetAiResponse(() => meetAiAccess(request(), params))).status
    ).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each([['membership_lookup_failed', 500]])(
    'handles %s without querying meeting data',
    async (error, status) => {
      const from = vi.fn();
      mocks.admin.mockResolvedValue({ from });
      mocks.user.mockResolvedValue({ id: 'actor' });
      mocks.membership.mockResolvedValue({ ok: false, error });
      expect(
        (await meetAiResponse(() => meetAiAccess(request(), params))).status
      ).toBe(status);
      expect(from).not.toHaveBeenCalled();
    }
  );
  it('allows shared participant reads but reserves mutations for the creator', async () => {
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
    mocks.shared.mockResolvedValue(false);
    expect(
      (await meetAiResponse(() => meetAiAccess(request(), params))).status
    ).toBe(403);
    mocks.shared.mockResolvedValue(true);
    const personal = await meetAiAccess(request(), {
      params: Promise.resolve({
        wsId: 'personal',
        meetingId: '00000000-0000-4000-8000-000000000001',
      }),
    });
    expect(personal.wsId).toBe('workspace');
    expect(mocks.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        wsId: 'personal',
        principal: { id: 'actor', email: null },
      })
    );
    expect((await meetAiAccess(request(), params)).canManage).toBe(false);
    mocks.membership.mockResolvedValue({
      ok: false,
      error: 'membership_missing',
    });
    expect((await meetAiAccess(request(), params)).canManage).toBe(false);
    mocks.shared.mockRejectedValue(new Error('offline'));
    expect(
      (await meetAiResponse(() => meetAiAccess(request(), params))).status
    ).toBe(503);
    expect(
      (await meetAiResponse(() => meetAiAccess(request(), params, true))).status
    ).toBe(403);
    expect(query.eq).toHaveBeenCalledWith('ws_id', 'workspace');
  });
});

it('returns an allowlisted provider failure code without raw provider details', async () => {
  const response = await meetAiResponse(async () => {
    throw new MeetAiGenerationError('quota_exceeded', 429);
  });
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({
    code: 'MEET_AI_PROVIDER_LIMIT',
    error: 'Meeting AI provider request failed',
  });
});
