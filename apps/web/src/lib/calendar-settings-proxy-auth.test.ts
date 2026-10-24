// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarPreferenceGuardOptions } from './calendar-preference-guard';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  assurance: vi.fn(),
  auth: vi.fn(),
  personal: vi.fn(),
  workspace: vi.fn(),
  client: vi.fn(),
}));
vi.mock('@tuturuuu/utils/offline-download-guard', () => ({
  guardOfflineDownloadRequest: async () => null,
}));
vi.mock('@tuturuuu/utils/required-mfa-request', () => ({
  checkRequiredAccountMfa: (...args: unknown[]) => mocks.assurance(...args),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ auth: { getUser: mocks.getUser } }),
  createClient: mocks.client,
}));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    async limit() {
      return {
        success: true,
        limit: 60,
        remaining: 59,
        reset: Date.now() + 60_000,
      };
    }
  },
}));
vi.mock('@upstash/redis', () => ({
  Redis: class {
    static fromEnv() {
      return {};
    }
  },
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge', () => ({
  extractIPFromRequest: () => '192.0.2.1',
  isIPBlockedEdge: async () => null,
  readEdgeAbuseProtectionControls: async () => ({
    ipBlockingEnabled: true,
    rateLimitsEnabled: true,
  }),
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge-trust', () => ({
  getCachedTrustEntries: async () => new Map(),
  hasCachedIpBlockAppealRelief: async () => false,
}));
vi.mock('@tuturuuu/utils/request-emoji-limit', () => ({
  validateRequestEmojiLimit: async () => null,
}));
vi.mock('@tuturuuu/utils/abuse-protection/user-suspension', () => ({
  checkUserSuspension: async () => ({ suspended: false }),
}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('./calendar-personal-mutation-quota', () => ({
  calendarPersonalSessionControls: async () => ({
    response: null,
    headers: {},
    finalize: (response: Response) => response,
  }),
}));
vi.mock(
  '@tuturuuu/internal-api/calendar-settings-server',
  async (original) => ({
    ...(await original<object>()),
    personalCalendarSettings: mocks.personal,
    workspaceCalendarSettings: mocks.workspace,
  })
);
function request(path: string) {
  return new NextRequest(`https://tuturuuu.com${path}`, {
    headers: {
      authorization: 'Bearer eyJprovider',
      'x-tuturuuu-verified-user': 'forged',
    },
  });
}
async function dispatch(req: NextRequest, workspace?: string) {
  const { guardApiProxyRequest } = await import(
    '@tuturuuu/utils/api-proxy-guard'
  );
  const { handleCalendarSettings } = await import(
    './calendar-settings-handler'
  );
  const response = await guardApiProxyRequest(
    req,
    calendarPreferenceGuardOptions(req)
  );
  return response ?? handleCalendarSettings(req, workspace);
}
describe('calendar proxy assurance before route identity resolution', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fixture');
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'actor', app_metadata: {} } },
      error: null,
    });
    mocks.client.mockResolvedValue({});
    mocks.auth.mockResolvedValue({
      ok: true,
      user: { id: 'actor' },
      supabase: {},
    });
    mocks.personal.mockResolvedValue({ timezone: 'auto' });
    mocks.workspace.mockResolvedValue({ timezone: 'auto' });
    mocks.assurance.mockImplementation(async (_req, deps) => {
      await (await deps.createUserClient()).auth.getUser();
      return { status: 'allowed', userId: 'actor', proof: null };
    });
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    ['/api/v1/users/calendar-settings', undefined],
    ['/api/v1/workspaces/ws/calendar-settings', 'ws'],
  ])(
    'blocks failed MFA before %s can resolve or access settings',
    async (path, workspace) => {
      mocks.assurance.mockResolvedValue({
        status: 'required',
        userId: 'actor',
      });
      const response = await dispatch(request(path), workspace);
      expect(response.status).toBe(403);
      expect(response.headers.get('X-Tuturuuu-Auth-Assurance')).toBe(
        'required'
      );
      expect(mocks.auth).not.toHaveBeenCalled();
      expect(mocks.personal).not.toHaveBeenCalled();
      expect(mocks.workspace).not.toHaveBeenCalled();
    }
  );
  it('reuses the actual request-owned verified user and calls the provider once in the guard', async () => {
    const response = await dispatch(request('/api/v1/users/calendar-settings'));
    expect(response.status).toBe(200);
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith('eyJprovider');
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.personal).toHaveBeenCalledWith(
      { userId: 'actor', supabase: {} },
      { method: 'GET' }
    );
  });
  it('falls back to independent route authentication across a cloned Next request boundary', async () => {
    const { guardApiProxyRequest } = await import(
      '@tuturuuu/utils/api-proxy-guard'
    );
    const { handleCalendarSettings } = await import(
      './calendar-settings-handler'
    );
    const req = request('/api/v1/users/calendar-settings');
    expect(
      await guardApiProxyRequest(req, calendarPreferenceGuardOptions(req))
    ).toBeNull();
    const clone = new NextRequest(req.clone());
    expect((await handleCalendarSettings(clone)).status).toBe(200);
    expect(mocks.auth).toHaveBeenCalledWith(clone, {
      allowAppSessionAuth: false,
    });
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith('eyJprovider');
  });
});
