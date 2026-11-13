// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../cloudflare/worker';

const suppliers = vi.hoisted(() => ({ workspace: vi.fn(), fetch: vi.fn() }));

// Keep Worker, bridge, registry and proxy routing real; isolate external services.
vi.mock(
  '@tuturuuu/satellite/workspace-settings-route-handlers',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@tuturuuu/satellite/workspace-settings-route-handlers')
    >()),
    createSatelliteWorkspaceRouteHandlers: () => ({ GET: suppliers.workspace }),
  })
);
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({
    fetch: () => {
      throw new Error('Unexpected SSR');
    },
  }),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/utils/api-proxy-guard')>()),
  guardApiProxyRequest: vi.fn().mockResolvedValue(null),
  hasAuthenticatedBearerToken: (headers: Headers) =>
    headers.get('authorization') === 'Bearer fictional-test-only',
}));

const env = {
  INTERNAL_WEB_API_ORIGIN: 'https://web.example.invalid',
  SUPABASE_SECRET_KEY: 'fictional-test-only',
  TUTURUUU_APP_COORDINATION_SECRET: 'fictional-test-only',
};
const ctx = { waitUntil: vi.fn() };

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubGlobal('fetch', suppliers.fetch);
  suppliers.workspace
    .mockReset()
    .mockResolvedValue(Response.json({ owner: 'tasks' }));
  suppliers.fetch
    .mockReset()
    .mockImplementation(() => Response.json({ owner: 'web' }, { status: 401 }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function request(path: string, mounted: boolean) {
  return new Request(
    `${mounted ? 'https://tuturuuu.com/tasks' : 'https://tasks.tuturuuu.com'}${path}`,
    {
      headers: { authorization: 'Bearer fictional-test-only' },
    }
  );
}

describe.each([false, true])(
  'exported Tasks Worker routing (mounted=%s)',
  (mounted) => {
    it('forwards the legacy static invitation route before the dynamic workspace route', async () => {
      const response = await worker.fetch(
        request('/api/workspaces/invitations?pending=1', mounted),
        env,
        ctx
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ owner: 'web' });
      expect(suppliers.workspace).not.toHaveBeenCalled();
      expect(suppliers.fetch).toHaveBeenCalledOnce();
      const [forwarded] = suppliers.fetch.mock.calls[0]!;
      expect(
        new URL(
          forwarded instanceof Request ? forwarded.url : String(forwarded)
        ).href
      ).toBe(
        'https://web.example.invalid/api/workspaces/invitations?pending=1'
      );
    });

    it('retains real workspace IDs in the native registry', async () => {
      const response = await worker.fetch(
        request('/api/workspaces/ws-1', mounted),
        env,
        ctx
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ owner: 'tasks' });
      expect(suppliers.workspace).toHaveBeenCalledOnce();
      expect(await suppliers.workspace.mock.calls[0]![1].params).toEqual({
        wsId: 'ws-1',
      });
      expect(suppliers.fetch).not.toHaveBeenCalled();
    });
  }
);
