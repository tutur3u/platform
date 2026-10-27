// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
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

const tutoringRoutesDir = resolve(
  __dirname,
  '../../app/api/v1/workspaces/[wsId]/tutoring'
);

function listRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listRouteFiles(path);
    return entry.name === 'route.ts' ? [path] : [];
  });
}

const routeFiles = listRouteFiles(tutoringRoutesDir).map((path) => ({
  name: relative(tutoringRoutesDir, path),
  source: readFileSync(path, 'utf8'),
}));

describe('every tutoring route is behind the ENABLE_TUTORING gate', () => {
  it('finds the tutoring routes', () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(9);
  });

  it.each(routeFiles)(
    '$name never reads permissions directly',
    ({ source }) => {
      expect(source).not.toMatch(/\bgetPermissions\b/);
    }
  );

  it.each(routeFiles)(
    '$name resolves access through resolveTutoringRouteAccess',
    ({ source }) => {
      expect(source).toMatch(
        /export (?:async function|const) (?:GET|POST|PUT|PATCH|DELETE)\b/
      );
      expect(source).toContain('resolveTutoringRouteAccess(');
    }
  );

  it.each(
    routeFiles.filter(({ source }) => /export async function/.test(source))
  )('$name gates every exported handler', ({ source }) => {
    const handlers = source
      .split(/^export async function /m)
      .slice(1)
      .filter((handler) => /^(GET|POST|PUT|PATCH|DELETE)\b/.test(handler));

    for (const handler of handlers) {
      expect(handler).toContain('resolveTutoringRouteAccess(');
    }
  });
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
