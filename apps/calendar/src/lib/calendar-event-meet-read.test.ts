import {
  createAppSessionToken,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import { NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  normalize: vi.fn(),
  membership: vi.fn(),
  resolveAuth: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalize,
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.resolveAuth,
}));

import { authorizeCalendarEventManagement } from './calendar-event-permission';

const ACTOR = '00000000-0000-4000-8000-000000004901';
const PERSONAL = '00000000-0000-4000-8000-000000004902';
const TEAM = '00000000-0000-4000-8000-000000004903';
const SECRET = 'synthetic-calendar-admission-test-secret';
const query = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
};
const supabase = { from: vi.fn(), rpc: vi.fn() };
const readOptions = { allowMeetPersonalRead: true };

function request(targetApp = 'meet', method = 'GET', secret = SECRET) {
  const { token } = createAppSessionToken(
    { targetApp, userId: ACTOR },
    { secret }
  );
  return new Request(`https://calendar.example.invalid/api/events`, {
    method,
    headers: { cookie: `tuturuuu_app_session=${token}` },
  });
}

async function status(
  result: Awaited<ReturnType<typeof authorizeCalendarEventManagement>>
) {
  return 'error' in result ? result.error.status : 200;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', SECRET);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: { id: PERSONAL }, error: null });
  supabase.from.mockReturnValue(query);
  supabase.rpc.mockResolvedValue({ data: true, error: null });
  mocks.normalize.mockImplementation(async (id: string) => id);
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.admin.mockResolvedValue({ syntheticAdmin: true });
  // Exercise the real signed-session audience policy, not an always-OK auth stub.
  mocks.resolveAuth.mockImplementation(async (req, options) => {
    const session = verifyAppSessionRequest(req, options.allowAppSessionAuth);
    return session.ok
      ? { ok: true, user: { id: session.claims.sub }, supabase }
      : {
          ok: false,
          response: NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          ),
        };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('signed Meet personal Calendar read admission', () => {
  it.each(['personal', PERSONAL])(
    'reads only its own personal workspace via %s',
    async (wsId) => {
      const result = await authorizeCalendarEventManagement(
        request(),
        wsId,
        readOptions
      );
      expect(await status(result)).toBe(200);
      expect(query.eq).toHaveBeenCalledWith('personal', true);
      expect(query.eq).toHaveBeenCalledWith('workspace_members.user_id', ACTOR);
      expect(query.eq).toHaveBeenCalledWith('workspace_members.type', 'MEMBER');
      expect(mocks.membership).toHaveBeenCalledWith({
        wsId: PERSONAL,
        userId: ACTOR,
        supabase,
      });
      expect(supabase.rpc).toHaveBeenCalledWith('has_workspace_permission', {
        p_ws_id: PERSONAL,
        p_user_id: ACTOR,
        p_permission: 'manage_calendar',
      });
    }
  );
  it('retains the baseline Meet audience denial without the read option', async () => {
    expect(
      await status(await authorizeCalendarEventManagement(request(), PERSONAL))
    ).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each(['POST', 'PATCH', 'DELETE'])(
    'does not expand %s admission even when the option is accidentally supplied',
    async (method) => {
      expect(
        await status(
          await authorizeCalendarEventManagement(
            request('meet', method),
            PERSONAL,
            readOptions
          )
        )
      ).toBe(401);
      expect(supabase.from).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    }
  );
  it.each([TEAM, '00000000-0000-4000-8000-000000004904'])(
    'denies a different workspace %s before permission/admin reads',
    async (wsId) => {
      expect(
        await status(
          await authorizeCalendarEventManagement(request(), wsId, readOptions)
        )
      ).toBe(403);
      expect(mocks.membership).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    }
  );
  it('rejects a valid audience with a different resolved actor', async () => {
    mocks.resolveAuth.mockResolvedValue({
      ok: true,
      user: { id: 'another-actor' },
      supabase,
    });
    expect(
      await status(
        await authorizeCalendarEventManagement(request(), PERSONAL, readOptions)
      )
    ).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('rejects a forged signature', async () => {
    expect(
      await status(
        await authorizeCalendarEventManagement(
          request('meet', 'GET', 'different-synthetic-key'),
          PERSONAL,
          readOptions
        )
      )
    ).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it('rejects an expired signed session before workspace reads', async () => {
    const { token } = createAppSessionToken(
      { targetApp: 'meet', userId: ACTOR },
      { secret: SECRET, now: new Date('2020-01-01T00:00:00Z') }
    );
    const req = new Request('https://calendar.example.invalid/api/events', {
      headers: { cookie: `tuturuuu_app_session=${token}` },
    });
    expect(
      await status(
        await authorizeCalendarEventManagement(req, PERSONAL, readOptions)
      )
    ).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it.each([
    [{ data: null, error: null }, 404],
    [{ data: null, error: { message: 'synthetic unavailable' } }, 500],
  ])(
    'does not publish a failed personal workspace lookup %j',
    async (lookup, expected) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      query.maybeSingle.mockResolvedValue(lookup);
      expect(
        await status(
          await authorizeCalendarEventManagement(
            request(),
            PERSONAL,
            readOptions
          )
        )
      ).toBe(expected);
      expect(mocks.membership).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    }
  );
  it('fails closed when the requested workspace cannot be normalized', async () => {
    mocks.normalize.mockRejectedValue(new Error('synthetic lookup failure'));
    expect(
      await status(
        await authorizeCalendarEventManagement(request(), PERSONAL, readOptions)
      )
    ).toBe(500);
    expect(mocks.membership).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('does not admit an unrelated signed satellite audience', async () => {
    expect(
      await status(
        await authorizeCalendarEventManagement(
          request('mail'),
          PERSONAL,
          readOptions
        )
      )
    ).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it.each(['calendar', 'tasks'])(
    'keeps the existing %s workspace access contract',
    async (target) => {
      expect(
        await status(
          await authorizeCalendarEventManagement(
            request(target),
            TEAM,
            readOptions
          )
        )
      ).toBe(200);
      expect(supabase.from).not.toHaveBeenCalled();
      expect(mocks.membership).toHaveBeenCalledWith({
        wsId: TEAM,
        userId: ACTOR,
        supabase,
      });
    }
  );
  it.each([
    [{ ok: false, error: 'membership_required' }, 403],
    [{ ok: false, error: 'membership_lookup_failed' }, 500],
  ])('preserves membership failure %j', async (membership, expected) => {
    mocks.membership.mockResolvedValue(membership);
    expect(
      await status(
        await authorizeCalendarEventManagement(request(), PERSONAL, readOptions)
      )
    ).toBe(expected);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each([
    [{ data: false, error: null }, 403],
    [{ data: null, error: { message: 'synthetic failure' } }, 500],
  ])('preserves manage_calendar failure %j', async (permission, expected) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    supabase.rpc.mockResolvedValue(permission);
    expect(
      await status(
        await authorizeCalendarEventManagement(request(), PERSONAL, readOptions)
      )
    ).toBe(expected);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
