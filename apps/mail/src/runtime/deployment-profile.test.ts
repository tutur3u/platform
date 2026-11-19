// @vitest-environment node
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const suppliers = vi.hoisted(() => ({
  start: vi.fn<(request: Request) => Promise<Response>>(),
  proxy: vi.fn(),
  verify: vi.fn<(request: Request) => Promise<boolean>>(),
  assets: vi.fn(async () => new Response('asset')),
}));
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: suppliers.start }),
}));
vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('../proxy', () => ({ proxy: suppliers.proxy }));
vi.mock('./api-registry.bridge.gen', () => ({ endpoints: [] }));
vi.mock('./mail-api-server', () => ({ registerMailServerApiPaths: () => {} }));
vi.mock('@tuturuuu/utils/cloudflare-access', async (actual) => ({
  ...(await actual<typeof import('@tuturuuu/utils/cloudflare-access')>()),
  verifyCloudflareAccessRequest: suppliers.verify,
}));

const env = { ASSETS: { fetch: suppliers.assets } };
const ctx = { waitUntil: (work: Promise<unknown>) => void work };

async function load(profile: string | undefined) {
  vi.resetModules();
  // Stub first so unstubAllEnvs restores the pinned value, then unset it.
  vi.stubEnv('MAIL_DEPLOYMENT_PROFILE', profile ?? '');
  if (profile === undefined) delete process.env.MAIL_DEPLOYMENT_PROFILE;
  return import('./handler');
}

beforeEach(() => {
  vi.resetAllMocks();
  suppliers.assets.mockImplementation(async () => new Response('asset'));
  suppliers.proxy.mockImplementation(async () => NextResponse.next());
  suppliers.start.mockResolvedValue(new Response('served'));
  suppliers.verify.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe('Mail deployment profile', () => {
  it.each([undefined, '', 'Production', 'prod', 'preview'])(
    'fails closed when the profile is %j',
    async (profile) => {
      await expect(load(profile)).rejects.toThrow(
        /MAIL_DEPLOYMENT_PROFILE must be/
      );
    }
  );

  it('accepts development only for the dev server, never a build', async () => {
    const { resolveMailDeploymentProfile } =
      await import('./deployment-profile');
    expect(resolveMailDeploymentProfile('development', 'serve')).toBe(
      'development'
    );
    expect(() => resolveMailDeploymentProfile('development')).toThrow();
    expect(() =>
      resolveMailDeploymentProfile('development', 'build')
    ).toThrow();
    expect(() => resolveMailDeploymentProfile(undefined, 'serve')).toThrow();
    expect(resolveMailDeploymentProfile('production', 'build')).toBe(
      'production'
    );
  });

  it('gives each profile its own root and mount hosts', async () => {
    for (const [profile, root, mounts, unknown] of [
      [
        'production',
        ['mail.tuturuuu.com'],
        ['tuturuuu.com', 'web.tutur3u.com'],
        'root',
      ],
      ['staging', ['mail.tutur3u.com'], [], 'reject'],
    ] as const) {
      vi.resetModules();
      vi.stubEnv('MAIL_DEPLOYMENT_PROFILE', profile);
      const { mailMounts } = await import('./mail-mount');
      expect(mailMounts.rootHosts).toEqual(root);
      expect(mailMounts.mountHosts).toEqual(mounts);
      expect(mailMounts.unknownHost).toBe(unknown);
      expect(mailMounts.basePath).toBe('/mail');
    }
  });

  // The staging artifact never answers production or other hosts.
  it.each([
    'mail.tuturuuu.com',
    'tuturuuu.com',
    'web.tutur3u.com',
    'tuturuuu-mail-wave1-staging.fixture.workers.dev',
  ])(
    'staging rejects %s with 404 before Access, middleware or SSR',
    async (host) => {
      const { handleMailRequest } = await load('staging');
      const response = await handleMailRequest(
        new Request(`https://${host}/en/personal`),
        env,
        ctx
      );
      expect(response.status).toBe(404);
      expect(suppliers.verify).not.toHaveBeenCalled();
      expect(suppliers.proxy).not.toHaveBeenCalled();
      expect(suppliers.start).not.toHaveBeenCalled();
      expect(suppliers.assets).not.toHaveBeenCalled();
    }
  );

  it('staging serves its own host only after Access verification', async () => {
    const { handleMailRequest } = await load('staging');
    const response = await handleMailRequest(
      new Request('https://mail.tutur3u.com/en/personal'),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    expect(suppliers.verify).toHaveBeenCalledTimes(1);
  });

  it('staging answers 403 before any work when Access verification fails', async () => {
    suppliers.verify.mockResolvedValue(false);
    const { handleMailRequest } = await load('staging');
    for (const path of [
      '/en/personal',
      '/api/build-info',
      '/_rum',
      '/api/v1/x',
    ]) {
      const response = await handleMailRequest(
        new Request(`https://mail.tutur3u.com${path}`),
        env,
        ctx
      );
      expect(response.status).toBe(403);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    expect(suppliers.proxy).not.toHaveBeenCalled();
    expect(suppliers.start).not.toHaveBeenCalled();
    expect(suppliers.assets).not.toHaveBeenCalled();
  });

  it('production never consults Access', async () => {
    const { handleMailRequest } = await load('production');
    const response = await handleMailRequest(
      new Request('https://mail.tuturuuu.com/en/personal'),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    expect(suppliers.verify).not.toHaveBeenCalled();
  });

  it('production serves its root host without a redirect', async () => {
    const { handleMailRequest } = await load('production');
    const response = await handleMailRequest(
      new Request('https://mail.tuturuuu.com/en/personal'),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});
