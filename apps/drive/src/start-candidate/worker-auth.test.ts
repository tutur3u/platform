// @vitest-environment node
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const runtime = vi.hoisted(() => {
  vi.stubEnv('TTR_URL', 'https://staging.tutur3u.com');
  vi.stubEnv('NEXT_PUBLIC_WEB_APP_URL', 'https://staging.tutur3u.com');
  vi.stubEnv(
    'TUTURUUU_APP_COORDINATION_SECRET',
    'disposable-drive-test-signing-key'
  );
  return {
    loadModule: vi.fn().mockResolvedValue({ endpoints: [] }),
    start: vi.fn(async () => new Response('private Start page')),
    fetch: vi.fn(async () => {
      throw new Error('Unauthenticated requests must not reach an upstream');
    }),
  };
});
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: runtime.start }),
}));
vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  updateSession: () => {
    throw new Error('No provider session');
  },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: () => {
    throw new Error('No provider session');
  },
  createAdminClient: () => {
    throw new Error('No admin access');
  },
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: () => {
    throw new Error('No authenticated user');
  },
  withForwardedInternalApiAuth: () => {
    throw new Error('No authenticated user');
  },
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: () => {
    throw new Error('No authenticated user');
  },
}));

import worker from '../../cloudflare/worker';
import { stagingVars } from './staging-policy';

const origin = 'https://drive.staging.tutur3u.com';
const env = { ...stagingVars, ASSETS: { fetch: runtime.fetch } };
const ctx = { waitUntil: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('__driveTestRsc', { loadModule: runtime.loadModule });
  vi.stubGlobal('fetch', runtime.fetch);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => vi.unstubAllEnvs());

describe('Drive Worker with the real app proxy and session verification', () => {
  it.each(['/personal', '/vi/personal'])(
    'redirects unauthenticated %s to central staging login',
    async (path) => {
      const response = await worker.fetch(
        new Request(`${origin}${path}`),
        env,
        ctx
      );
      expect(response.status).toBe(307);
      const login = new URL(response.headers.get('location') ?? '');
      expect(login.origin).toBe('https://staging.tutur3u.com');
      expect(login.pathname).toBe('/login');
      const callback = new URL(login.searchParams.get('returnUrl') ?? '');
      expect(callback.origin).toBe(origin);
      expect(callback.pathname).toBe('/verify-token');
      expect(callback.searchParams.get('nextUrl')).toBe(path);
      expect(runtime.start).not.toHaveBeenCalled();
      expect(runtime.fetch).not.toHaveBeenCalled();
    }
  );

  it('refuses an API request without a session before forwarding', async () => {
    const response = await worker.fetch(
      new Request(`${origin}/api/v1/workspaces/workspace-a/storage/list`),
      env,
      ctx
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(response.headers.has('location')).toBe(false);
    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.fetch).not.toHaveBeenCalled();
  });
});
