import { describe, expect, it, vi } from 'vitest';
import { createSerwistConfig } from '../create-serwist-config';

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
