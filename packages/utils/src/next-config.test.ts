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
    expect(config.images?.remotePatterns).toEqual(
      TUTURUUU_NEXT_IMAGE_REMOTE_PATTERNS
    );
    expect(config.poweredByHeader).toBe(false);
    expect(config.reactStrictMode).toBe(true);
    expect(config.typescript?.ignoreBuildErrors).toBe(true);
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
      reactCompiler: true,
      transpilePackages: ['@tuturuuu/ui'],
      experimental: {
        cpus: 2,
      },
      typescript: {
        ignoreBuildErrors: false,
      },
    });

    expect(config.cacheComponents).toBe(false);
    expect(config.reactCompiler).toBe(true);
    expect(config.transpilePackages).toEqual(['@tuturuuu/ui']);
    expect(config.experimental?.cpus).toBe(2);
    expect(config.typescript?.ignoreBuildErrors).toBe(false);
  });
});

describe('isTuturuuuNextCacheComponentsEnabled', () => {
  it('keeps cache components enabled by default', () => {
    expect(isTuturuuuNextCacheComponentsEnabled({})).toBe(true);
  });

  it('honors explicit environment overrides', () => {
    expect(
      isTuturuuuNextCacheComponentsEnabled({
        TUTURUUU_NEXT_CACHE_COMPONENTS: '0',
      })
    ).toBe(false);
    expect(
      isTuturuuuNextCacheComponentsEnabled({
        TUTURUUU_NEXT_CACHE_COMPONENTS: '1',
      })
    ).toBe(true);
  });
});

describe('isTuturuuuNextReactCompilerEnabled', () => {
  it('disables React Compiler by default for next dev', () => {
    expect(
      isTuturuuuNextReactCompilerEnabled({ NODE_ENV: 'development' })
    ).toBe(false);
  });

  it('keeps React Compiler enabled by default outside next dev', () => {
    expect(isTuturuuuNextReactCompilerEnabled({ NODE_ENV: 'production' })).toBe(
      true
    );
  });

  it('honors explicit environment overrides', () => {
    expect(
      isTuturuuuNextReactCompilerEnabled({
        NODE_ENV: 'production',
        TUTURUUU_NEXT_REACT_COMPILER: '0',
      })
    ).toBe(false);
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
});

describe('trimTrailingSlashes', () => {
  it('removes only trailing slash characters', () => {
    expect(trimTrailingSlashes('https://example.com/path///')).toBe(
      'https://example.com/path'
    );
  });
});
