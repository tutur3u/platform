import { existsSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSerwistConfig } from '../create-serwist-config';
import { getTurbopackConfig } from '../create-turbopack-config';

// Mock @serwist/next
vi.mock('@serwist/next', () => ({
  default: vi.fn((config) => {
    return (nextConfig: unknown) => ({
      ...(nextConfig as object),
      serwistConfig: config,
    });
  }),
}));

describe('createSerwistConfig', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('should emit deprecation warning', () => {
    createSerwistConfig();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('createSerwistConfig is deprecated')
    );
  });

  it('should create a config with default values', () => {
    const withSerwist = createSerwistConfig();
    const result = withSerwist({ reactStrictMode: true }) as {
      serwistConfig: { swSrc: string; swDest: string };
    };

    expect(result.serwistConfig).toBeDefined();
    expect(result.serwistConfig.swSrc).toBe('src/app/sw.ts');
    expect(result.serwistConfig.swDest).toBe('public/sw.js');
  });

  it('should use custom swSrc and swDest', () => {
    const withSerwist = createSerwistConfig({
      swSrc: 'src/sw.ts',
      swDest: 'public/service-worker.js',
    });
    const result = withSerwist({}) as {
      serwistConfig: { swSrc: string; swDest: string };
    };

    expect(result.serwistConfig.swSrc).toBe('src/sw.ts');
    expect(result.serwistConfig.swDest).toBe('public/service-worker.js');
  });

  it('should include offline fallback URL in precache entries', () => {
    const withSerwist = createSerwistConfig({
      offlineFallbackUrl: '/custom-offline',
    });
    const result = withSerwist({}) as {
      serwistConfig: {
        additionalPrecacheEntries: Array<{ url: string; revision: string }>;
      };
    };

    expect(result.serwistConfig.additionalPrecacheEntries).toContainEqual(
      expect.objectContaining({ url: '/custom-offline' })
    );
  });

  it('should use provided revision', () => {
    const withSerwist = createSerwistConfig({
      revision: 'test-revision-123',
    });
    const result = withSerwist({}) as {
      serwistConfig: {
        additionalPrecacheEntries: Array<{ url: string; revision: string }>;
      };
    };

    expect(result.serwistConfig.additionalPrecacheEntries).toContainEqual(
      expect.objectContaining({ revision: 'test-revision-123' })
    );
  });

  it('should use default offline fallback URL', () => {
    const withSerwist = createSerwistConfig();
    const result = withSerwist({}) as {
      serwistConfig: {
        additionalPrecacheEntries: Array<{ url: string; revision: string }>;
      };
    };

    expect(result.serwistConfig.additionalPrecacheEntries).toContainEqual(
      expect.objectContaining({ url: '/~offline' })
    );
  });

  it('should pass through next config properties', () => {
    const withSerwist = createSerwistConfig();
    const result = withSerwist({
      reactStrictMode: true,
      poweredByHeader: false,
    }) as {
      reactStrictMode: boolean;
      poweredByHeader: boolean;
    };

    expect(result.reactStrictMode).toBe(true);
    expect(result.poweredByHeader).toBe(false);
  });
});

describe('getTurbopackConfig', () => {
  const webProjectRoot = path.resolve(__dirname, '../../../../../apps/web');

  it('should return config with esbuild-wasm in serverExternalPackages', () => {
    const config = getTurbopackConfig();

    expect(config.serverExternalPackages).toBeDefined();
    expect(config.serverExternalPackages).toContain('esbuild-wasm');
  });

  it('should include esbuild-wasm sidecar files in Serwist route tracing', () => {
    const config = getTurbopackConfig({ projectRoot: webProjectRoot });
    const serwistIncludes =
      config.outputFileTracingIncludes?.['/serwist/[path]'];

    expect(serwistIncludes).toBeDefined();
    expect(
      serwistIncludes?.map((include) => path.basename(include)).sort()
    ).toEqual(['esbuild.wasm', 'wasm_exec.js', 'wasm_exec_node.js']);

    for (const include of serwistIncludes ?? []) {
      expect(existsSync(path.resolve(webProjectRoot, include))).toBe(true);
    }
  });

  it('should merge additional output file tracing includes', () => {
    const config = getTurbopackConfig({
      projectRoot: webProjectRoot,
      outputFileTracingIncludes: {
        '/api/custom': ['./custom-runtime-file.js'],
        '/serwist/[path]': ['./custom-serwist-file.js'],
      },
    });

    expect(config.outputFileTracingIncludes?.['/api/custom']).toContain(
      './custom-runtime-file.js'
    );
    expect(config.outputFileTracingIncludes?.['/serwist/[path]']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/wasm_exec_node\.js$/),
        './custom-serwist-file.js',
      ])
    );
  });

  it('should include additional external packages', () => {
    const config = getTurbopackConfig({
      additionalExternalPackages: ['custom-pkg', 'another-pkg'],
    });

    expect(config.serverExternalPackages).toContain('esbuild-wasm');
    expect(config.serverExternalPackages).toContain('custom-pkg');
    expect(config.serverExternalPackages).toContain('another-pkg');
  });

  it('should return partial NextConfig that can be spread', () => {
    const config = getTurbopackConfig();
    const nextConfig = {
      ...config,
      reactStrictMode: true,
    };

    expect(nextConfig.serverExternalPackages).toContain('esbuild-wasm');
    expect(nextConfig.reactStrictMode).toBe(true);
  });
});
