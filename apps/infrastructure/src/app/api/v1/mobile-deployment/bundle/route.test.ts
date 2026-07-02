import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  extractIPFromHeaders: vi.fn(),
  fetchMobileDeploymentBundle: vi.fn(),
  verifyGitHubOidcToken: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  extractIPFromHeaders: (
    ...args: Parameters<typeof mocks.extractIPFromHeaders>
  ) => mocks.extractIPFromHeaders(...args),
}));

vi.mock('@/lib/mobile-deployment/oidc', () => ({
  verifyGitHubOidcToken: (
    ...args: Parameters<typeof mocks.verifyGitHubOidcToken>
  ) => mocks.verifyGitHubOidcToken(...args),
}));

vi.mock('@/lib/mobile-deployment/store', () => ({
  MobileDeploymentStoreError: class MobileDeploymentStoreError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
  fetchMobileDeploymentBundle: (
    ...args: Parameters<typeof mocks.fetchMobileDeploymentBundle>
  ) => mocks.fetchMobileDeploymentBundle(...args),
}));

function bundleRequest(headers?: HeadersInit, platform = 'android') {
  return new Request(
    `http://localhost/api/v1/mobile-deployment/bundle?environment=production&platform=${platform}`,
    { headers }
  );
}

describe('mobile deployment bundle route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.createAdminClient.mockResolvedValue({ service: 'db' });
    mocks.extractIPFromHeaders.mockReturnValue('203.0.113.10');
    mocks.verifyGitHubOidcToken.mockResolvedValue({
      actor: 'octocat',
      environment: 'mobile-store-beta',
      ref: 'refs/heads/production',
      repository: 'tutur3u/platform',
      runAttempt: '1',
      runId: '123',
      sha: 'abc123',
      workflowRef:
        'tutur3u/platform/.github/workflows/mobile-deploy-stores.yaml@refs/heads/production',
    });
    mocks.fetchMobileDeploymentBundle.mockResolvedValue({
      environment: 'production',
      files: {},
      platform: 'android',
      scalars: {},
      version: 'version-1',
    });
  });

  it('requires a bearer token before checking GitHub OIDC', async () => {
    const { GET } = await import('./route');

    const response = await GET(bundleRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.verifyGitHubOidcToken).not.toHaveBeenCalled();
    expect(mocks.fetchMobileDeploymentBundle).not.toHaveBeenCalled();
  });

  it('rejects unsupported platform requests without touching the store', async () => {
    const { GET } = await import('./route');

    const response = await GET(
      bundleRequest({ authorization: 'Bearer token' }, 'web')
    );

    expect(response.status).toBe(401);
    expect(mocks.verifyGitHubOidcToken).not.toHaveBeenCalled();
    expect(mocks.fetchMobileDeploymentBundle).not.toHaveBeenCalled();
  });

  it('returns a platform bundle only after bearer and OIDC checks pass', async () => {
    const { GET } = await import('./route');

    const response = await GET(
      bundleRequest({
        authorization: 'Bearer ci-token',
        'x-github-oidc-token': 'oidc-token',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      environment: 'production',
      platform: 'android',
      version: 'version-1',
    });
    expect(mocks.verifyGitHubOidcToken).toHaveBeenCalledWith('oidc-token');
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.fetchMobileDeploymentBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        db: { service: 'db' },
        platform: 'android',
        requestIp: '203.0.113.10',
        token: 'ci-token',
      })
    );
  });

  it('uses generic auth failures for invalid OIDC tokens', async () => {
    mocks.verifyGitHubOidcToken.mockRejectedValue(new Error('bad token'));

    const { GET } = await import('./route');

    const response = await GET(
      bundleRequest({
        authorization: 'Bearer ci-token',
        'x-github-oidc-token': 'oidc-token',
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('does not leak readiness details when the active bundle is unavailable', async () => {
    const { MobileDeploymentStoreError } = await import(
      '@/lib/mobile-deployment/store'
    );
    mocks.fetchMobileDeploymentBundle.mockRejectedValue(
      new MobileDeploymentStoreError('missing resource', 409)
    );

    const { GET } = await import('./route');

    const response = await GET(
      bundleRequest({
        authorization: 'Bearer ci-token',
        'x-github-oidc-token': 'oidc-token',
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: 'Mobile deployment bundle unavailable',
    });
  });
});
