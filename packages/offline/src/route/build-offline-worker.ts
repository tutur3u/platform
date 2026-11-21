import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createPrecacheManifest } from '../precache/create-precache-manifest';
import type { OfflineRouteConfig, OfflineWorkerFile } from './types';

const DEFAULT_PUBLIC_PRECACHE_PATTERNS = ['public/**/*'] as const;

function normalizeDistDir(distDir: string) {
  return distDir.replace(/^\/|\/$/g, '');
}

function generateGlobPatterns(
  distDir: string,
  publicPrecachePatterns: OfflineRouteConfig['publicPrecachePatterns'],
  precacheStaticAssets: boolean
) {
  const patterns = precacheStaticAssets
    ? [
        `${distDir}/static/**/*.{js,css,html,ico,apng,png,avif,jpg,jpeg,jfif,pjpeg,pjp,gif,svg,webp,json,webmanifest}`,
      ]
    : [];

  if (publicPrecachePatterns !== false) {
    patterns.push(
      ...(publicPrecachePatterns ?? DEFAULT_PUBLIC_PRECACHE_PATTERNS)
    );
  }

  return patterns;
}

export function getGitRevision() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf-8',
  });
  return result.stdout?.trim() || crypto.randomUUID();
}

/**
 * Bundles the service worker with its precache manifest. `createOfflineRoute`
 * calls it on first request or at prerender; Worker builds call it before
 * bundling and serve the files with `createPrebuiltOfflineRoute`. Paths are
 * relative to `cwd`.
 */
export async function buildOfflineWorker(
  config: Omit<OfflineRouteConfig, 'disableInDev'> = {},
  cwd = process.cwd()
): Promise<OfflineWorkerFile[]> {
  const {
    esbuildOptions = {},
    globDirectory = '.',
    nextConfig = {},
    offlineFallbackUrl = '/~offline',
    publicPrecachePatterns,
    precacheStaticAssets = true,
    revision = getGitRevision(),
    swSrc = 'src/app/sw.ts',
  } = config;
  const distDir = normalizeDistDir(nextConfig.distDir ?? '.next');
  const swSrcPath = path.isAbsolute(swSrc)
    ? swSrc
    : path.join(/* turbopackIgnore: true */ cwd, swSrc);
  const isDevelopment = process.env.NODE_ENV === 'development';
  const manifest = isDevelopment
    ? []
    : await createPrecacheManifest({
        additionalEntries: [{ revision, url: offlineFallbackUrl }],
        assetPrefix: nextConfig.assetPrefix,
        basePath: nextConfig.basePath,
        cwd,
        distDir,
        globDirectory,
        globIgnores: [
          '**/node_modules/**/*',
          path.relative(
            path.resolve(/* turbopackIgnore: true */ cwd, globDirectory),
            swSrcPath
          ),
        ],
        globPatterns: generateGlobPatterns(
          distDir,
          publicPrecachePatterns,
          precacheStaticAssets
        ),
      });
  const esbuild = await import('esbuild-wasm');
  const result = await esbuild.build({
    assetNames: '[name]-[hash]',
    bundle: true,
    chunkNames: '[name]-[hash]',
    entryNames: '[name]',
    entryPoints: [{ in: swSrcPath, out: 'sw' }],
    format: 'esm',
    minify: !isDevelopment,
    outdir: cwd,
    platform: 'browser',
    sourcemap: true,
    target: 'es2020',
    treeShaking: true,
    ...esbuildOptions,
    define: {
      ...esbuildOptions.define,
      'self.__TUTURUUU_PRECACHE_MANIFEST': JSON.stringify(manifest, null, 2),
    },
    write: false,
  });

  if (result.errors.length > 0) {
    throw new Error('Failed to build the offline service worker.');
  }

  return result.outputFiles.map((file) => ({
    path: path.relative(cwd, file.path),
    contents: file.text,
  }));
}
