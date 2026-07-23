import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createPrecacheManifest } from '../precache/create-precache-manifest';
import type { OfflineRouteConfig, OfflineRouteResult } from './types';

const DEFAULT_PUBLIC_PRECACHE_PATTERNS = ['public/**/*'] as const;
const contentTypeMap: Record<string, string> = {
  '.js': 'application/javascript; charset=UTF-8',
  '.map': 'application/json; charset=UTF-8',
};

function normalizeDistDir(distDir: string) {
  return distDir.replace(/^\/|\/$/g, '');
}

function generateGlobPatterns(
  distDir: string,
  publicPrecachePatterns: OfflineRouteConfig['publicPrecachePatterns']
) {
  const patterns = [
    `${distDir}/static/**/*.{js,css,html,ico,apng,png,avif,jpg,jpeg,jfif,pjpeg,pjp,gif,svg,webp,json,webmanifest}`,
  ];

  if (publicPrecachePatterns !== false) {
    patterns.push(
      ...(publicPrecachePatterns ?? DEFAULT_PUBLIC_PRECACHE_PATTERNS)
    );
  }

  return patterns;
}

function getGitRevision() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf-8',
  });
  return result.stdout?.trim() || crypto.randomUUID();
}

/**
 * Creates the build-time route that serves Tuturuuu's internally owned worker.
 * The legacy `/serwist/sw.js` URL remains stable for installed workers.
 */
export function createOfflineRoute(
  config: OfflineRouteConfig = {}
): OfflineRouteResult {
  const {
    disableInDev = true,
    esbuildOptions = {},
    globDirectory = '.',
    nextConfig = {},
    offlineFallbackUrl = '/~offline',
    publicPrecachePatterns,
    revision = getGitRevision(),
    swSrc = 'src/app/sw.ts',
  } = config;

  if (disableInDev && process.env.NODE_ENV === 'development') {
    return {
      generateStaticParams: async () => [],
      GET: async () => new Response(null, { status: 204 }),
    };
  }

  const cwd = process.cwd();
  const distDir = normalizeDistDir(nextConfig.distDir ?? '.next');
  const swSrcPath = path.isAbsolute(swSrc) ? swSrc : path.join(cwd, swSrc);
  let outputFiles: Map<string, string> | null = null;

  const loadOutputFiles = async () => {
    if (outputFiles) {
      return outputFiles;
    }

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
            path.relative(path.resolve(cwd, globDirectory), swSrcPath),
          ],
          globPatterns: generateGlobPatterns(distDir, publicPrecachePatterns),
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

    outputFiles = new Map(
      result.outputFiles.map((file) => [file.path, file.text])
    );
    return outputFiles;
  };

  return {
    generateStaticParams: async () => {
      const files = await loadOutputFiles();
      return [...files.keys()].map((filePath) => ({
        path: path.relative(cwd, filePath),
      }));
    },
    GET: async (_, context) => {
      const { path: filePath } = await context.params;
      const files = await loadOutputFiles();
      const contents = files.get(path.join(cwd, filePath));

      if (contents === undefined) {
        return new Response('Not found', { status: 404 });
      }

      return new Response(contents, {
        headers: {
          'Content-Type':
            contentTypeMap[path.extname(filePath)] ??
            'text/plain; charset=UTF-8',
          'Service-Worker-Allowed': '/',
        },
      });
    },
  };
}

/** @deprecated Use `createOfflineRoute`. */
export const createSerwistRoute = createOfflineRoute;
