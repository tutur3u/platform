import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { programmingAuthorScope, programmingServerContext } from './server';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  sessionUser: vi.fn(),
  admin: vi.fn(),
  permissions: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@tuturuuu/auth/supabase-session-user', () => ({
  getSupabaseSessionUser: mocks.sessionUser,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/utils/workspace-helper')
  >()),
  getPermissions: mocks.permissions,
}));
const actor = '11111111-1111-4111-8111-111111111111';
const cookieActor = '22222222-2222-4222-8222-222222222222';
const wsId = '33333333-3333-4333-8333-333333333333';
const filters: Array<[string, string, unknown]> = [];
let member = actor;
const token = (targetApp = 'learn') =>
  createAppSessionToken(
    { userId: actor, targetApp },
    { secret: 'synthetic-programming-session-key' }
  ).token;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv(
    'TUTURUUU_APP_COORDINATION_SECRET',
    'synthetic-programming-session-key'
  );
  filters.length = 0;
  member = actor;
  mocks.sessionUser.mockResolvedValue(null);
  mocks.headers.mockResolvedValue(
    new Headers({ cookie: `tuturuuu_app_session=${token()}` })
  );
  mocks.permissions.mockResolvedValue({ withoutPermission: () => false });
  mocks.admin.mockImplementation(async () => ({
    auth: {},
    from: (table: string) => {
      const values = new Map<string, unknown>();
      const query = {
        select: (_columns: string) => query,
        eq: (column: string, value: unknown) => {
          values.set(column, value);
          filters.push([table, column, value]);
          return query;
        },
        maybeSingle: async () => ({
          data:
            table === 'workspace_members'
              ? values.get('user_id') === member
                ? { type: 'MEMBER' }
                : null
              : table === 'workspace_secrets'
                ? { value: 'true' }
                : null,
          error: null,
        }),
      };
      return query;
    },
  }));
});
afterEach(() => vi.unstubAllEnvs());
describe('Programming verified actor matches gateway app-session authorization', () => {
  it('accepts a real signed Learn app session without a Supabase JWT and performs actual author membership checks', async () => {
    const { context, access } = await programmingAuthorScope(wsId);
    expect(access.ok).toBe(true);
    expect(context.user.id).toBe(actor);
    expect(filters).toContainEqual(['workspace_members', 'user_id', actor]);
    expect(mocks.sessionUser).not.toHaveBeenCalled();
    expect(mocks.admin).toHaveBeenCalledWith({ noCookie: true });
    expect((await context.supabase.auth.getUser()).data.user?.id).toBe(actor);
    expect(mocks.permissions).toHaveBeenCalledWith({
      user: context.user,
      wsId,
    });
  });
  it('ignores a conflicting Supabase cookie identity and binds all local authorization to the verified app actor', async () => {
    mocks.sessionUser.mockResolvedValue({ id: cookieActor } as SupabaseUser);
    const context = await programmingServerContext();
    expect(context.user.id).toBe(actor);
    expect((await context.supabase.auth.getClaims()).data?.claims?.sub).toBe(
      actor
    );
    member = cookieActor;
    const { access } = await programmingAuthorScope(wsId);
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.response.status).toBe(403);
    expect(filters).toContainEqual(['workspace_members', 'user_id', actor]);
    expect(
      filters.some(
        ([, column, value]) => column === 'user_id' && value === cookieActor
      )
    ).toBe(false);
    expect(mocks.sessionUser).not.toHaveBeenCalled();
  });
  it('invalid or wrong-target app sessions cannot fall back to an unrelated valid Supabase cookie', async () => {
    mocks.sessionUser.mockResolvedValue({ id: cookieActor } as SupabaseUser);
    for (const value of [token('mail'), `${token().slice(0, -1)}!`]) {
      mocks.headers.mockResolvedValue(
        new Headers({ cookie: `tuturuuu_app_session=${value}` })
      );
      await expect(programmingServerContext()).rejects.toMatchObject({
        status: 401,
      });
    }
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('binds the verified Supabase actor when no app session is supplied and rejects an unauthenticated request before admin access', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.sessionUser.mockResolvedValue({ id: cookieActor } as SupabaseUser);
    expect((await programmingServerContext()).user.id).toBe(cookieActor);
    mocks.admin.mockClear();
    mocks.sessionUser.mockResolvedValue(null);
    await expect(programmingServerContext()).rejects.toMatchObject({
      status: 401,
    });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
