import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  verify: vi.fn(),
  db: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mock.db,
}));
vi.mock('@/lib/desktop-deployment/oidc', () => ({
  verifyDesktopGitHubOidcToken: mock.verify,
}));
vi.mock('@/lib/desktop-deployment/bundle-store', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/desktop-deployment/bundle-store')
  >()),
  fetchDesktopSigningBundle: mock.fetch,
}));

import { POST } from './route';

const token = `ttr_desktop_ci_${'a'.repeat(43)}`;
function request(
  body: unknown = { platform: 'windows' },
  headers: Record<string, string> = {}
) {
  return new Request(
    'https://infrastructure.example/api/v1/desktop-deployment/bundle',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'x-github-oidc-token': 'signed-fixture',
        ...headers,
      },
      body: JSON.stringify(body),
    }
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DESKTOP_DEPLOYMENT_VAULT_ENABLED', 'true');
  mock.verify.mockResolvedValue({ runId: '123' });
  mock.db.mockResolvedValue({ service: 'db' });
  mock.fetch.mockResolvedValue({
    schemaVersion: 1,
    platform: 'windows',
    files: [],
    scalars: {},
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('default-off independent desktop signing endpoint', () => {
  it('defaults off before verification or service access', async () => {
    vi.stubEnv('DESKTOP_DEPLOYMENT_VAULT_ENABLED', '');
    const result = await POST(request());
    expect(result.status).toBe(503);
    expect(mock.verify).not.toHaveBeenCalled();
    expect(mock.db).not.toHaveBeenCalled();
  });
  it('verifies the fixed OIDC contract before service-client or token lookup', async () => {
    const order: string[] = [];
    mock.verify.mockImplementation(async () => {
      order.push('verify');
      return { runId: '123' };
    });
    mock.db.mockImplementation(async () => {
      order.push('db');
      return {};
    });
    mock.fetch.mockImplementation(async () => {
      order.push('bundle');
      return {};
    });
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(order).toEqual(['verify', 'db', 'bundle']);
    expect(mock.db).toHaveBeenCalledWith({ noCookie: true });
    expect(mock.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        token,
        platform: 'windows',
        claims: { runId: '123' },
      })
    );
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(result.headers.get('Pragma')).toBe('no-cache');
  });
  it('denies invalid/expired OIDC before service access without exposing diagnostics', async () => {
    mock.verify.mockRejectedValue(new Error('synthetic-private-claims'));
    const result = await POST(request());
    expect(result.status).toBe(401);
    expect(await result.text()).not.toContain('synthetic-private');
    expect(mock.db).not.toHaveBeenCalled();
  });
  it.each([
    { platform: 'linux' },
    { platform: 'windows', environment: 'unprotected' },
    { platform: 'macos', token },
  ])(
    'rejects unsupported or extra body fields before OIDC %j',
    async (body) => {
      const result = await POST(request(body));
      expect(result.status).toBe(400);
      expect(mock.verify).not.toHaveBeenCalled();
      expect(mock.db).not.toHaveBeenCalled();
    }
  );
  it.each(['Bearer wrong', `Bearer ${token} extra`, `Basic ${token}`])(
    'rejects malformed bearer header %s',
    async (authorization) => {
      const result = await POST(request(undefined, { authorization }));
      expect(result.status).toBe(401);
      expect(mock.verify).not.toHaveBeenCalled();
    }
  );
  it('bounds actual streamed request bytes', async () => {
    const result = await POST(
      request({ platform: 'windows', extra: 'a'.repeat(2000) })
    );
    expect(result.status).toBe(400);
    expect(mock.db).not.toHaveBeenCalled();
  });
  it('does not return raw storage errors', async () => {
    mock.fetch.mockRejectedValue(new Error('synthetic-private-certificate'));
    const result = await POST(request());
    expect(result.status).toBe(500);
    expect(await result.json()).toEqual({ code: 'desktop_bundle_unavailable' });
  });
});
