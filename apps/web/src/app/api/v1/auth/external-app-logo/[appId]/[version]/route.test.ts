import { beforeEach, describe, expect, it, vi } from 'vitest';
import { externalAppLogoVersion } from '@/lib/app-coordination/external-app-logo';

const mocks = vi.hoisted(() => ({
  getCachedExternalAppLogo: vi.fn(),
  getExternalAppById: vi.fn(),
}));

vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppById: mocks.getExternalAppById,
}));
vi.mock('@/lib/app-coordination/external-app-logo', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/app-coordination/external-app-logo')
  >()),
  getCachedExternalAppLogo: mocks.getCachedExternalAppLogo,
}));

const { GET, HEAD } = await import('./route');

const LOGO = 'https://cdn.example.net/logo.png';

const call = (appId: string, version: string, search = '') =>
  GET(
    new Request(
      `https://tuturuuu.com/api/v1/auth/external-app-logo/${appId}/${version}${search}`
    ),
    { params: Promise.resolve({ appId, version }) }
  );

describe('GET /api/v1/auth/external-app-logo/[appId]/[version]', () => {
  let version: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    version = await externalAppLogoVersion(LOGO);
    mocks.getExternalAppById.mockResolvedValue({
      enabled: true,
      id: 'edufest',
      logoUrl: LOGO,
    });
    mocks.getCachedExternalAppLogo.mockResolvedValue({
      body: new Uint8Array([1, 2, 3]),
      contentType: 'image/png',
    });
  });

  it('serves the registered logo from this origin with a locked-down policy', async () => {
    const response = await call('edufest', version);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'none'"
    );
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(mocks.getCachedExternalAppLogo).toHaveBeenCalledWith(LOGO);
  });

  it.each([
    ['an invalid id', '../secrets', 'v', undefined],
    ['an unknown app', 'missing', 'v', null],
    ['a disabled app', 'edufest', 'v', { enabled: false, logoUrl: LOGO }],
    ['an app without a logo', 'edufest', 'v', { enabled: true, logoUrl: null }],
    ['a stale or guessed version', 'edufest', '0123456789abcdef', undefined],
  ])('returns 404 without a fetch for %s', async (_name, appId, v, app) => {
    if (app !== undefined) mocks.getExternalAppById.mockResolvedValue(app);
    const response = await call(appId, v === 'v' ? version : v);
    expect(response.status).toBe(404);
    expect(mocks.getCachedExternalAppLogo).not.toHaveBeenCalled();
  });

  it('refuses a cache-busting query string before any lookup', async () => {
    const response = await call('edufest', version, '?n=1');
    expect(response.status).toBe(404);
    expect(mocks.getExternalAppById).not.toHaveBeenCalled();
    expect(mocks.getCachedExternalAppLogo).not.toHaveBeenCalled();
  });

  it('never fetches for HEAD', () => {
    expect(HEAD().status).toBe(405);
    expect(mocks.getCachedExternalAppLogo).not.toHaveBeenCalled();
  });

  it('returns a briefly cached 404 when the logo cannot be fetched', async () => {
    mocks.getCachedExternalAppLogo.mockResolvedValue(null);
    const response = await call('edufest', version);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
  });
});
