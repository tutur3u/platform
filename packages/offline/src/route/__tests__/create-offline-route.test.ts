import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../precache/create-precache-manifest', () => ({
  createPrecacheManifest: vi.fn(async () => []),
}));

vi.mock('esbuild-wasm', () => ({
  build: vi.fn(async () => ({
    errors: [],
    outputFiles: [
      {
        path: `${process.cwd()}/sw.js`,
        text: 'const manifest = [];',
      },
    ],
    warnings: [],
  })),
}));

describe('createOfflineRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates route handlers', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createOfflineRoute } = await import('../create-offline-route.js');
    const result = createOfflineRoute();

    expect(result.GET).toBeTypeOf('function');
    expect(result.generateStaticParams).toBeTypeOf('function');
  });

  it('returns 204 in development when registration is disabled', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { createOfflineRoute } = await import('../create-offline-route.js');
    const result = createOfflineRoute({ disableInDev: true });
    const response = await result.GET(new Request('https://example.com'), {
      params: Promise.resolve({ path: 'sw.js' }),
    });

    expect(response.status).toBe(204);
  });

  it('bundles and serves the worker when enabled', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { createOfflineRoute } = await import('../create-offline-route.js');
    const result = createOfflineRoute({ disableInDev: false });
    const response = await result.GET(new Request('https://example.com'), {
      params: Promise.resolve({ path: 'sw.js' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Service-Worker-Allowed')).toBe('/');
  });

  it('returns 404 for output paths the compiler did not produce', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createOfflineRoute } = await import('../create-offline-route.js');
    const result = createOfflineRoute();
    const response = await result.GET(new Request('https://example.com'), {
      params: Promise.resolve({ path: 'missing.js' }),
    });

    expect(response.status).toBe(404);
  });

  it('passes the worker source and modern target to esbuild', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createOfflineRoute } = await import('../create-offline-route.js');
    const { build } = await import('esbuild-wasm');
    const result = createOfflineRoute({ swSrc: 'custom/sw.ts' });

    await result.GET(new Request('https://example.com'), {
      params: Promise.resolve({ path: 'sw.js' }),
    });

    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        entryPoints: [
          expect.objectContaining({
            in: expect.stringContaining('custom/sw.ts'),
          }),
        ],
        target: 'es2020',
      })
    );
  });

  it('builds a precache manifest with the offline fallback', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createOfflineRoute } = await import('../create-offline-route.js');
    const { createPrecacheManifest } = await import(
      '../../precache/create-precache-manifest.js'
    );
    const result = createOfflineRoute({
      offlineFallbackUrl: '/custom-offline',
      revision: 'revision-1',
    });

    await result.GET(new Request('https://example.com'), {
      params: Promise.resolve({ path: 'sw.js' }),
    });

    expect(createPrecacheManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalEntries: [{ revision: 'revision-1', url: '/custom-offline' }],
        globPatterns: expect.arrayContaining(['public/**/*']),
      })
    );
  });

  it('supports disabling public asset precaching', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createOfflineRoute } = await import('../create-offline-route.js');
    const { createPrecacheManifest } = await import(
      '../../precache/create-precache-manifest.js'
    );
    const result = createOfflineRoute({ publicPrecachePatterns: false });

    await result.GET(new Request('https://example.com'), {
      params: Promise.resolve({ path: 'sw.js' }),
    });

    expect(createPrecacheManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        globPatterns: expect.not.arrayContaining(['public/**/*']),
      })
    );
  });
});
