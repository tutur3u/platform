import { existsSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOfflineConfig,
  createSerwistConfig,
} from '../create-offline-config';
import { getOfflineTurbopackConfig } from '../create-offline-turbopack-config';

describe('createOfflineConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('passes through Next.js configuration without external wrappers', () => {
    const nextConfig = { poweredByHeader: false, reactStrictMode: true };

    expect(createOfflineConfig()(nextConfig)).toBe(nextConfig);
  });

  it('keeps the deprecated alias operational', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const nextConfig = { reactStrictMode: true };

    expect(createSerwistConfig()(nextConfig)).toBe(nextConfig);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('createSerwistConfig was replaced')
    );
  });
});

describe('getOfflineTurbopackConfig', () => {
  const webProjectRoot = path.resolve(__dirname, '../../../../../apps/web');

  it('traces esbuild-wasm runtime files', () => {
    const config = getOfflineTurbopackConfig({
      projectRoot: webProjectRoot,
    });
    const includes = config.outputFileTracingIncludes?.['/serwist/[path]'];

    expect(config.serverExternalPackages).toContain('esbuild-wasm');
    expect(includes?.map((include) => path.basename(include)).sort()).toEqual([
      'esbuild.wasm',
      'wasm_exec.js',
      'wasm_exec_node.js',
    ]);

    for (const include of includes ?? []) {
      expect(existsSync(path.resolve(webProjectRoot, include))).toBe(true);
    }
  });

  it('merges custom tracing and external package options', () => {
    const config = getOfflineTurbopackConfig({
      additionalExternalPackages: ['custom-package'],
      outputFileTracingIncludes: {
        '/api/custom': ['./custom-runtime.js'],
        '/serwist/[path]': ['./custom-worker.js'],
      },
      projectRoot: webProjectRoot,
    });

    expect(config.serverExternalPackages).toContain('custom-package');
    expect(config.outputFileTracingIncludes?.['/api/custom']).toEqual([
      './custom-runtime.js',
    ]);
    expect(config.outputFileTracingIncludes?.['/serwist/[path]']).toContain(
      './custom-worker.js'
    );
  });
});
