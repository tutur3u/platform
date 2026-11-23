import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchExternalAppLogo: vi.fn(),
  getExternalAppById: vi.fn(),
}));

vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppById: mocks.getExternalAppById,
}));
vi.mock('@/lib/app-coordination/external-app-logo', () => ({
  fetchExternalAppLogo: mocks.fetchExternalAppLogo,
}));

const { GET } = await import('./route');

const call = (appId: string) =>
  GET(
    new Request(`https://tuturuuu.com/api/v1/auth/external-app-logo/${appId}`),
    {
      params: Promise.resolve({ appId }),
    }
  );

describe('GET /api/v1/auth/external-app-logo/[appId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getExternalAppById.mockResolvedValue({
      enabled: true,
      id: 'edufest',
      logoUrl: 'https://cdn.example.net/logo.png',
    });
    mocks.fetchExternalAppLogo.mockResolvedValue({
      body: new Uint8Array([1, 2, 3]),
      contentType: 'image/png',
    });
  });

  it('serves the registered logo from this origin with a locked-down policy', async () => {
    const response = await call('edufest');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'none'"
    );
    expect(response.headers.get('cache-control')).toContain('s-maxage=86400');
    expect(mocks.fetchExternalAppLogo).toHaveBeenCalledWith(
      'https://cdn.example.net/logo.png'
    );
  });

  it.each([
    ['an invalid id', '../secrets', undefined],
    ['an unknown app', 'missing', null],
    [
      'a disabled app',
      'edufest',
      { enabled: false, logoUrl: 'https://x.test/a.png' },
    ],
  ])('returns 404 for %s', async (_name, appId, app) => {
    if (app !== undefined) mocks.getExternalAppById.mockResolvedValue(app);
    const response = await call(appId);
    expect(response.status).toBe(404);
    expect(mocks.fetchExternalAppLogo).not.toHaveBeenCalled();
  });

  it('returns a briefly cached 404 when the logo cannot be fetched', async () => {
    mocks.fetchExternalAppLogo.mockResolvedValue(null);
    const response = await call('edufest');
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
  });
});
