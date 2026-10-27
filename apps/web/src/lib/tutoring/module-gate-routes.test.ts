// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const sessionId = 'f0747f37-bf6d-4263-a5df-a11c57bdc762';

const state = vi.hoisted(() => ({
  canView: true,
  configError: null as unknown,
  configValue: null as string | null,
  personal: false,
  schemaCalls: 0,
}));

function fakeAdmin() {
  return {
    from(table: string) {
      const builder = {
        eq: () => builder,
        like: async () => ({ data: [], error: null }),
        maybeSingle: async () => {
          if (table === 'workspaces') {
            return { data: { personal: state.personal }, error: null };
          }
          return state.configError
            ? { data: null, error: state.configError }
            : {
                data:
                  state.configValue === null
                    ? null
                    : { value: state.configValue },
                error: null,
              };
        },
        select: () => builder,
      };
      return builder;
    },
    schema() {
      state.schemaCalls += 1;
      throw new Error('tutoring data must not be read while the module is off');
    },
  };
}

vi.mock('next/server', () => ({
  connection: async () => {},
  NextResponse: { json: Response.json },
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  attachSupabaseAuthUser: vi.fn(),
  getAppSessionUserFromRequest: () => null,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => fakeAdmin(),
  createClient: async () => ({}),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({ user: { id: 'actor' } }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({
    wsId,
    withoutPermission: (permission: string) =>
      permission === 'view_user_groups' ? !state.canView : false,
  }),
}));

const params = Promise.resolve({ id: sessionId, wsId });

function call(
  method: string,
  path: string,
  body?: unknown
): Request & { method: string } {
  return new Request(`http://localhost/api/v1/workspaces/${wsId}/${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const routes = {
  'GET /tutoring/sessions': async () =>
    (
      await import('../../app/api/v1/workspaces/[wsId]/tutoring/sessions/route')
    ).GET(call('GET', 'tutoring/sessions'), { params }),
  'POST /tutoring/sessions': async () =>
    (
      await import('../../app/api/v1/workspaces/[wsId]/tutoring/sessions/route')
    ).POST(call('POST', 'tutoring/sessions', {}), { params }),
  'PUT /tutoring/sessions/{id}': async () =>
    (
      await import(
        '../../app/api/v1/workspaces/[wsId]/tutoring/sessions/[id]/route'
      )
    ).PUT(call('PUT', `tutoring/sessions/${sessionId}`, {}), { params }),
  'GET /tutoring/queue': async () =>
    (
      await import('../../app/api/v1/workspaces/[wsId]/tutoring/queue/route')
    ).GET(call('GET', 'tutoring/queue'), { params }),
  'GET /tutoring/policy': async () =>
    (
      await import('../../app/api/v1/workspaces/[wsId]/tutoring/policy/route')
    ).GET(call('GET', 'tutoring/policy'), { params }),
  'PUT /tutoring/policy': async () =>
    (
      await import('../../app/api/v1/workspaces/[wsId]/tutoring/policy/route')
    ).PUT(call('PUT', 'tutoring/policy', {}), { params }),
};

beforeEach(() => {
  state.canView = true;
  state.configError = null;
  state.configValue = null;
  state.personal = false;
  state.schemaCalls = 0;
});

describe('ENABLE_TUTORING server gate', () => {
  describe.each(Object.entries(routes))('%s', (_name, run) => {
    it.each(['false', ' FALSE '])(
      'answers 404 before touching tutoring data when the toggle is %j',
      async (value) => {
        state.configValue = value;

        const response = await run();

        expect(response?.status).toBe(404);
        expect(state.schemaCalls).toBe(0);
      }
    );

    it('answers 404 for a personal workspace that never opted in', async () => {
      state.personal = true;

      expect((await run())?.status).toBe(404);
    });

    it('fails closed when the toggle cannot be read', async () => {
      state.configError = { message: 'boom' };
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect((await run())?.status).toBe(404);
      logged.mockRestore();
    });
  });

  it.each(['GET /tutoring/sessions', 'GET /tutoring/queue'] as const)(
    '%s keeps its own permission check when the toggle is on or unset',
    async (name) => {
      state.canView = false;

      for (const value of [null, 'true']) {
        state.configValue = value;
        expect((await routes[name]())?.status).toBe(403);
      }
    }
  );

  it('serves the policy for a shared workspace with no toggle row (UI default is on)', async () => {
    const response = await routes['GET /tutoring/policy']();

    expect(response?.status).toBe(200);
  });

  it('serves the policy when a personal workspace opted in', async () => {
    state.personal = true;
    state.configValue = 'true';

    expect((await routes['GET /tutoring/policy']())?.status).toBe(200);
  });
});
