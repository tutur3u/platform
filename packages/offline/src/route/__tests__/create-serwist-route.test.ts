import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @serwist/turbopack before importing the module under test
vi.mock('@serwist/turbopack', () => ({
  createSerwistRoute: vi.fn((config) => ({
    dynamic: 'force-static',
    dynamicParams: false,
    revalidate: false,
    generateStaticParams: async () => [{ path: 'sw.js' }],
    GET: async () => ({
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/javascript' }),
    }),
    _config: config, // Expose config for testing
  })),
}));

describe('createSerwistRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should create route handlers with default values', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createSerwistRoute } = await import('../create-serwist-route.js');

    const result = createSerwistRoute();

    expect(result.GET).toBeDefined();
    expect(typeof result.GET).toBe('function');
    expect(result.dynamic).toBe('force-static');
    expect(result.dynamicParams).toBe(false);
    expect(result.revalidate).toBe(false);
    expect(result.generateStaticParams).toBeDefined();
  });

  it('should return 204 in development when disableInDev is true', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { createSerwistRoute } = await import('../create-serwist-route.js');

    const result = createSerwistRoute({ disableInDev: true });
    const response = await result.GET({} as never, {
      params: Promise.resolve({ path: 'sw.js' }),
    });

    expect(response.status).toBe(204);
  });

  it('should serve SW in development when disableInDev is false', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { createSerwistRoute } = await import('../create-serwist-route.js');

    const result = createSerwistRoute({ disableInDev: false });

    expect(result.GET).toBeDefined();
    // The handler should be from the mocked createSerwistRoute, not the dev stub
    const response = await result.GET({} as never, {
      params: Promise.resolve({ path: 'sw.js' }),
    });
    expect(response.status).toBe(200);
  });

  it('should use custom swSrc path', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createSerwistRoute } = await import('../create-serwist-route.js');
    const { createSerwistRoute: mockCreateSerwistRoute } = await import(
      '@serwist/turbopack'
    );

    createSerwistRoute({ swSrc: 'custom/sw.ts' });

    expect(mockCreateSerwistRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        swSrc: 'custom/sw.ts',
      })
    );
  });

  it('should include offline fallback URL in precache entries', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createSerwistRoute } = await import('../create-serwist-route.js');
    const { createSerwistRoute: mockCreateSerwistRoute } = await import(
      '@serwist/turbopack'
    );

    createSerwistRoute({ offlineFallbackUrl: '/custom-offline' });

    expect(mockCreateSerwistRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalPrecacheEntries: expect.arrayContaining([
          expect.objectContaining({ url: '/custom-offline' }),
        ]),
      })
    );
  });

  it('should use provided revision', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createSerwistRoute } = await import('../create-serwist-route.js');
    const { createSerwistRoute: mockCreateSerwistRoute } = await import(
      '@serwist/turbopack'
    );

    createSerwistRoute({ revision: 'test-revision-abc' });

    expect(mockCreateSerwistRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalPrecacheEntries: expect.arrayContaining([
          expect.objectContaining({ revision: 'test-revision-abc' }),
        ]),
      })
    );
  });

  it('should use default offline fallback URL /~offline', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createSerwistRoute } = await import('../create-serwist-route.js');
    const { createSerwistRoute: mockCreateSerwistRoute } = await import(
      '@serwist/turbopack'
    );

    createSerwistRoute();

    expect(mockCreateSerwistRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalPrecacheEntries: expect.arrayContaining([
          expect.objectContaining({ url: '/~offline' }),
        ]),
      })
    );
  });
});
