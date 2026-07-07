import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@serwist/build', () => ({
  getFileManifestEntries: vi.fn(async () => ({
    count: 1,
    manifestEntries: [],
    size: 0,
    warnings: [],
  })),
  rebasePath: vi.fn(({ file }) => file),
}));

vi.mock('esbuild-wasm', () => ({
  build: vi.fn(async () => ({
    errors: [],
    outputFiles: [
      {
        path: `${process.cwd()}/sw.js`,
        text: 'self.__SW_MANIFEST=[];',
      },
    ],
    warnings: [],
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
    const response = await result.GET({} as never, {
      params: Promise.resolve({ path: 'sw.js' }),
    });
    expect(response.status).toBe(200);
  });

  it('should use custom swSrc path', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createSerwistRoute } = await import('../create-serwist-route.js');
    const { build } = await import('esbuild-wasm');

    const result = createSerwistRoute({ swSrc: 'custom/sw.ts' });

    await result.GET({} as never, {
      params: Promise.resolve({ path: 'sw.js' }),
    });

    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        entryPoints: [
          expect.objectContaining({
            in: expect.stringContaining('custom/sw.ts'),
          }),
        ],
      })
    );
  });

  it('should use a modern esbuild target by default', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createSerwistRoute } = await import('../create-serwist-route.js');
    const { build } = await import('esbuild-wasm');

    const result = createSerwistRoute();

    await result.GET({} as never, {
      params: Promise.resolve({ path: 'sw.js' }),
    });

    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'es2020',
      })
    );
  });

  it('should allow custom esbuild options', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createSerwistRoute } = await import('../create-serwist-route.js');
    const { build } = await import('esbuild-wasm');

    const result = createSerwistRoute({
      esbuildOptions: {
        target: 'es2022',
      },
    });

    await result.GET({} as never, {
      params: Promise.resolve({ path: 'sw.js' }),
    });

    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'es2022',
      })
    );
  });

  it('should include offline fallback URL in precache entries', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createSerwistRoute } = await import('../create-serwist-route.js');
    const { getFileManifestEntries } = await import('@serwist/build');

    const result = createSerwistRoute({
      offlineFallbackUrl: '/custom-offline',
    });

    await result.GET({} as never, {
      params: Promise.resolve({ path: 'sw.js' }),
    });

    expect(getFileManifestEntries).toHaveBeenCalledWith(
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
    const { getFileManifestEntries } = await import('@serwist/build');

    const result = createSerwistRoute({ revision: 'test-revision-abc' });

    await result.GET({} as never, {
      params: Promise.resolve({ path: 'sw.js' }),
    });

    expect(getFileManifestEntries).toHaveBeenCalledWith(
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
    const { getFileManifestEntries } = await import('@serwist/build');

    const result = createSerwistRoute();

    await result.GET({} as never, {
      params: Promise.resolve({ path: 'sw.js' }),
    });

    expect(getFileManifestEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalPrecacheEntries: expect.arrayContaining([
          expect.objectContaining({ url: '/~offline' }),
        ]),
      })
    );
  });

  it('should include public assets in precache globs by default', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createSerwistRoute } = await import('../create-serwist-route.js');
    const { getFileManifestEntries } = await import('@serwist/build');

    const result = createSerwistRoute();

    await result.GET({} as never, {
      params: Promise.resolve({ path: 'sw.js' }),
    });

    expect(getFileManifestEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        globPatterns: expect.arrayContaining(['public/**/*']),
      })
    );
  });

  it('should allow disabling public asset precache globs', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createSerwistRoute } = await import('../create-serwist-route.js');
    const { getFileManifestEntries } = await import('@serwist/build');

    const result = createSerwistRoute({ publicPrecachePatterns: false });

    await result.GET({} as never, {
      params: Promise.resolve({ path: 'sw.js' }),
    });

    expect(getFileManifestEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        globPatterns: expect.not.arrayContaining(['public/**/*']),
      })
    );
  });

  it('should allow custom public asset precache globs', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createSerwistRoute } = await import('../create-serwist-route.js');
    const { getFileManifestEntries } = await import('@serwist/build');

    const result = createSerwistRoute({
      publicPrecachePatterns: ['public/fonts/**/*'],
    });

    await result.GET({} as never, {
      params: Promise.resolve({ path: 'sw.js' }),
    });

    expect(getFileManifestEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        globPatterns: expect.arrayContaining(['public/fonts/**/*']),
      })
    );
    expect(getFileManifestEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        globPatterns: expect.not.arrayContaining(['public/**/*']),
      })
    );
  });
});
