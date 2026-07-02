import { describe, expect, it } from 'vitest';
import {
  createTuturuuuNextConfig,
  isTuturuuuNextCacheComponentsEnabled,
  isTuturuuuNextReactCompilerEnabled,
  resolveTuturuuuWebAppUrl,
  TUTURUUU_NEXT_IMAGE_REMOTE_PATTERNS,
  TUTURUUU_NEXT_OPTIMIZE_PACKAGE_IMPORTS,
  trimTrailingSlashes,
} from './next-config';

describe('createTuturuuuNextConfig', () => {
  it('applies shared local development defaults', () => {
    const config = createTuturuuuNextConfig();

    expect(config.allowedDevOrigins).toContain('tuturuuu.localhost');
    expect(config.cacheComponents).toBe(true);
    expect(config.partialPrefetching).toBe(true);
    expect(config.experimental?.turbopackFileSystemCacheForBuild).toBe(true);
    expect(config.experimental?.turbopackRustReactCompiler).toBe(true);
    expect(config.images?.remotePatterns).toEqual(
      TUTURUUU_NEXT_IMAGE_REMOTE_PATTERNS
    );
    expect(config.poweredByHeader).toBe(false);
    expect(config.reactCompiler).toBe(true);
    expect(config.reactStrictMode).toBe(true);
    expect(config.typescript?.ignoreBuildErrors).toBe(true);
  });

  it('does not expose loopback hosts to the shared image optimizer allowlist', () => {
    const config = createTuturuuuNextConfig();

    expect(config.images?.remotePatterns).not.toContainEqual({
      protocol: 'http',
      hostname: 'localhost',
    });
    expect(config.images?.remotePatterns).not.toContainEqual({
      protocol: 'http',
      hostname: '127.0.0.1',
    });
  });

  it('allows the exact worktree-prefixed Portless host for Next dev assets', () => {
    const originalPortlessUrl = process.env.PORTLESS_URL;

    try {
      process.env.PORTLESS_URL =
        'https://zalo-qr-chat-setup.chat.tuturuuu.localhost';

      const config = createTuturuuuNextConfig();

      expect(config.allowedDevOrigins).toContain(
        'zalo-qr-chat-setup.chat.tuturuuu.localhost'
      );
    } finally {
      if (originalPortlessUrl === undefined) {
        delete process.env.PORTLESS_URL;
      } else {
        process.env.PORTLESS_URL = originalPortlessUrl;
      }
    }
  });

  it('dedupes optimized package imports while preserving app additions', () => {
    const config = createTuturuuuNextConfig({
      experimental: {
        optimizePackageImports: ['lucide-react', '@tuturuuu/ui'],
      },
    });

    expect(config.experimental?.optimizePackageImports).toEqual([
      ...TUTURUUU_NEXT_OPTIMIZE_PACKAGE_IMPORTS,
      '@tuturuuu/ui',
    ]);
  });

  it('dedupes image remote patterns while preserving app additions', () => {
    const config = createTuturuuuNextConfig({
      images: {
        remotePatterns: [
          ...TUTURUUU_NEXT_IMAGE_REMOTE_PATTERNS,
          {
            protocol: 'https',
            hostname: 'models.dev',
          },
        ],
      },
    });

    expect(config.images?.remotePatterns).toEqual([
      ...TUTURUUU_NEXT_IMAGE_REMOTE_PATTERNS,
      {
        protocol: 'https',
        hostname: 'models.dev',
      },
    ]);
  });

  it('preserves app-specific config overrides', () => {
    const config = createTuturuuuNextConfig({
      cacheComponents: false,
      partialPrefetching: false,
      reactCompiler: false,
      transpilePackages: ['@tuturuuu/ui'],
      experimental: {
        cpus: 2,
        turbopackFileSystemCacheForBuild: false,
        turbopackRustReactCompiler: false,
      },
      typescript: {
        ignoreBuildErrors: false,
      },
    });

    expect(config.cacheComponents).toBe(false);
    expect(config.partialPrefetching).toBe(false);
    expect(config.reactCompiler).toBe(true);
    expect(config.transpilePackages).toEqual(['@tuturuuu/ui']);
    expect(config.experimental?.cpus).toBe(2);
    expect(config.experimental?.turbopackFileSystemCacheForBuild).toBe(false);
    expect(config.experimental?.turbopackRustReactCompiler).toBe(false);
    expect(config.typescript?.ignoreBuildErrors).toBe(false);
  });

  it('keeps cache components enabled for all apps by default', () => {
    const originalCacheComponents = process.env.TUTURUUU_NEXT_CACHE_COMPONENTS;

    try {
      process.env.TUTURUUU_NEXT_CACHE_COMPONENTS = '0';

      const config = createTuturuuuNextConfig();

      expect(config.cacheComponents).toBe(true);
      expect(config.partialPrefetching).toBe(true);
    } finally {
      if (originalCacheComponents === undefined) {
        delete process.env.TUTURUUU_NEXT_CACHE_COMPONENTS;
      } else {
        process.env.TUTURUUU_NEXT_CACHE_COMPONENTS = originalCacheComponents;
      }
    }
  });

  it('allows apps to explicitly override partial prefetching', () => {
    const config = createTuturuuuNextConfig({
      cacheComponents: true,
      partialPrefetching: false,
    });

    expect(config.cacheComponents).toBe(true);
    expect(config.partialPrefetching).toBe(false);
  });
});

describe('isTuturuuuNextCacheComponentsEnabled', () => {
  it('keeps cache components enabled by default', () => {
    expect(isTuturuuuNextCacheComponentsEnabled({})).toBe(true);
  });

  it('ignores deprecated environment opt-outs', () => {
    expect(
      isTuturuuuNextCacheComponentsEnabled({
        TUTURUUU_NEXT_CACHE_COMPONENTS: '0',
      })
    ).toBe(true);
    expect(
      isTuturuuuNextCacheComponentsEnabled({
        TUTURUUU_NEXT_CACHE_COMPONENTS: '1',
      })
    ).toBe(true);
  });
});

describe('isTuturuuuNextReactCompilerEnabled', () => {
  it('keeps React Compiler enabled for next dev', () => {
    expect(
      isTuturuuuNextReactCompilerEnabled({ NODE_ENV: 'development' })
    ).toBe(true);
  });

  it('keeps React Compiler enabled by default outside next dev', () => {
    expect(isTuturuuuNextReactCompilerEnabled({ NODE_ENV: 'production' })).toBe(
      true
    );
  });

  it('ignores explicit environment opt-outs', () => {
    expect(
      isTuturuuuNextReactCompilerEnabled({
        NODE_ENV: 'production',
        TUTURUUU_NEXT_REACT_COMPILER: '0',
      })
    ).toBe(true);
    expect(
      isTuturuuuNextReactCompilerEnabled({
        NODE_ENV: 'development',
        TUTURUUU_NEXT_REACT_COMPILER: '1',
      })
    ).toBe(true);
  });
});

describe('resolveTuturuuuWebAppUrl', () => {
  it('trims configured web app origins', () => {
    expect(
      resolveTuturuuuWebAppUrl({
        env: {
          INTERNAL_WEB_API_ORIGIN: 'https://example.com///',
          NODE_ENV: 'development',
        },
      })
    ).toBe('https://example.com');
  });

  it('uses the local Portless platform app in development', () => {
    expect(
      resolveTuturuuuWebAppUrl({
        centralPort: 7903,
        env: {
          NODE_ENV: 'development',
        },
      })
    ).toBe('https://tuturuuu.localhost');
  });

  it('allows a custom local fallback URL', () => {
    expect(
      resolveTuturuuuWebAppUrl({
        env: {
          NODE_ENV: 'development',
        },
        localFallbackUrl: 'https://tuturuuu.localhost/',
      })
    ).toBe('https://tuturuuu.localhost');
  });

  it('uses the production platform app in deployed environments', () => {
    expect(
      resolveTuturuuuWebAppUrl({
        env: {
          VERCEL_ENV: 'production',
        },
      })
    ).toBe('https://tuturuuu.com');
  });

  it('ignores known satellite NEXT_PUBLIC_APP_URL values when resolving the Web app URL', () => {
    expect(
      resolveTuturuuuWebAppUrl({
        env: {
          NEXT_PUBLIC_APP_URL: 'https://chat.tuturuuu.com',
          NODE_ENV: 'production',
        },
      })
    ).toBe('https://tuturuuu.com');
  });

  it('keeps explicit Web origins authoritative over satellite app URLs', () => {
    expect(
      resolveTuturuuuWebAppUrl({
        env: {
          NEXT_PUBLIC_APP_URL: 'https://chat.tuturuuu.com',
          WEB_APP_URL: 'https://web.internal.example.com/',
        },
      })
    ).toBe('https://web.internal.example.com');
  });

  it('allows platform NEXT_PUBLIC_APP_URL values as Web app URLs', () => {
    expect(
      resolveTuturuuuWebAppUrl({
        env: {
          NEXT_PUBLIC_APP_URL: 'https://tuturuuu.com/',
        },
      })
    ).toBe('https://tuturuuu.com');
  });
});

describe('trimTrailingSlashes', () => {
  it('removes only trailing slash characters', () => {
    expect(trimTrailingSlashes('https://example.com/path///')).toBe(
      'https://example.com/path'
    );
  });
});
