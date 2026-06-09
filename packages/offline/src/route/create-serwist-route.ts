import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  type GetManifestOptionsComplete,
  getFileManifestEntries,
  type ManifestEntryWithSize,
  rebasePath,
} from '@serwist/build';
import { NextResponse } from 'next/server';
import type { SerwistRouteConfig, SerwistRouteResult } from './types';

const isDev = process.env.NODE_ENV === 'development';
const contentTypeMap: Record<string, string> = {
  '.js': 'application/javascript',
  '.map': 'application/json; charset=UTF-8',
};

function normalizeDistDir(distDir: string): string {
  let normalized = distDir.startsWith('/') ? distDir.slice(1) : distDir;

  if (!normalized.endsWith('/')) {
    normalized += '/';
  }

  return normalized;
}

function generateGlobPatterns(distDir: string): string[] {
  return [
    `${distDir}static/**/*.{js,css,html,ico,apng,png,avif,jpg,jpeg,jfif,pjpeg,pjp,gif,svg,webp,json,webmanifest}`,
    'public/**/*',
  ];
}

/**
 * Gets the current git revision hash for cache busting.
 * Falls back to a random UUID if git is not available.
 */
function getGitRevision(): string {
  try {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf-8',
    });
    return result.stdout?.trim() || crypto.randomUUID();
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Creates a Serwist route handler for Next.js App Router with Turbopack.
 *
 * This handler serves the service worker compiled on-the-fly using esbuild,
 * enabling Turbopack compatibility.
 *
 * @param config - Configuration options for the route handler
 * @returns Route handlers and config to export from your route.ts file
 *
 * @example
 * ```ts
 * // In your app/serwist/[path]/route.ts:
 * import { createSerwistRoute } from '@tuturuuu/offline/route';
 *
 * export const { GET, dynamic, dynamicParams, revalidate, generateStaticParams } =
 *   createSerwistRoute();
 * ```
 */
export function createSerwistRoute(
  config: SerwistRouteConfig = {}
): SerwistRouteResult {
  const {
    swSrc = 'src/app/sw.ts',
    offlineFallbackUrl = '/~offline',
    revision = getGitRevision(),
    disableInDev = true,
    globDirectory = '.',
    nextConfig = {},
    esbuildOptions = {},
  } = config;

  // Skip in development if disabled
  if (disableInDev && process.env.NODE_ENV === 'development') {
    return {
      dynamic: 'force-static',
      dynamicParams: false,
      revalidate: false,
      generateStaticParams: async () => [],
      GET: async () => {
        // 204 No Content - cannot have a body
        return new Response(null, {
          status: 204,
        }) as unknown as ReturnType<SerwistRouteResult['GET']>;
      },
    };
  }

  const cwd = process.cwd();
  const distDir = normalizeDistDir(nextConfig.distDir ?? '.next');
  const swSrcPath = path.isAbsolute(swSrc)
    ? swSrc
    : path.join(/* turbopackIgnore: true */ cwd, swSrc);
  const buildConfig: GetManifestOptionsComplete & {
    cwd: string;
    swSrc: string;
    injectionPoint: string;
    nextConfig: {
      assetPrefix?: string;
      basePath: string;
      distDir: string;
    };
    esbuildOptions: NonNullable<SerwistRouteConfig['esbuildOptions']>;
  } = {
    cwd,
    swSrc: swSrcPath,
    injectionPoint: 'self.__SW_MANIFEST',
    globDirectory,
    globFollow: true,
    globIgnores: [
      '**/node_modules/**/*',
      rebasePath({
        file: swSrcPath,
        baseDirectory: globDirectory,
      }),
    ],
    globPatterns: generateGlobPatterns(distDir),
    globStrict: true,
    disablePrecacheManifest: false,
    maximumFileSizeToCacheInBytes: 2097152,
    dontCacheBustURLsMatching: new RegExp(`^${distDir}static/`),
    additionalPrecacheEntries: [{ url: offlineFallbackUrl, revision }],
    esbuildOptions: {
      // esbuild-wasm 0.28 refuses to downlevel destructuring for Serwist's
      // legacy default target list during production route generation.
      target: 'es2020',
      ...esbuildOptions,
    },
    nextConfig: {
      basePath: nextConfig.basePath ?? '/',
      distDir,
      assetPrefix: nextConfig.assetPrefix,
    },
    manifestTransforms: [
      (manifestEntries: ManifestEntryWithSize[]) => {
        const manifest = manifestEntries.map((entry) => {
          if (entry.url.startsWith(distDir)) {
            entry.url = `${nextConfig.assetPrefix ?? ''}/_next/${entry.url.slice(
              distDir.length
            )}`;
          }

          if (entry.url.startsWith('public/')) {
            entry.url = path.posix.join(
              nextConfig.basePath ?? '/',
              entry.url.slice(7)
            );
          }

          return entry;
        });

        return { manifest, warnings: [] };
      },
    ],
  };

  let outputFiles: Map<string, string> | null = null;

  const loadOutputFiles = async () => {
    if (outputFiles) {
      return outputFiles;
    }

    const { manifestEntries } = await getFileManifestEntries({
      ...buildConfig,
      disablePrecacheManifest: isDev,
      additionalPrecacheEntries: isDev
        ? []
        : buildConfig.additionalPrecacheEntries,
    });
    const manifestString =
      manifestEntries === undefined
        ? 'undefined'
        : JSON.stringify(manifestEntries, null, 2);
    const esbuild = await import('esbuild-wasm');
    const result = await esbuild.build({
      sourcemap: true,
      format: 'esm',
      target: 'es2020',
      treeShaking: true,
      minify: !isDev,
      bundle: true,
      ...buildConfig.esbuildOptions,
      platform: 'browser',
      define: {
        ...buildConfig.esbuildOptions.define,
        [buildConfig.injectionPoint]: manifestString,
      },
      outdir: buildConfig.cwd,
      write: false,
      entryNames: '[name]',
      assetNames: '[name]-[hash]',
      chunkNames: '[name]-[hash]',
      entryPoints: [
        {
          in: buildConfig.swSrc,
          out: 'sw',
        },
      ],
    });

    if (result.errors.length > 0) {
      throw new Error('Failed to build the service worker.');
    }

    outputFiles = new Map(
      result.outputFiles.map((outputFile) => [outputFile.path, outputFile.text])
    );
    return outputFiles;
  };

  // Return a lazy wrapper that defers service-worker bundling until the route
  // is generated or requested.
  return {
    dynamic: 'force-static',
    dynamicParams: false,
    revalidate: false,
    generateStaticParams: async () => {
      const files = await loadOutputFiles();
      return [...files.keys()].map((filePath) => ({
        path: path.relative(buildConfig.cwd, filePath),
      }));
    },
    GET: async (_, context) => {
      const { path: filePath } = await context.params;
      const files = await loadOutputFiles();

      return new NextResponse(files.get(path.join(buildConfig.cwd, filePath)), {
        headers: {
          'Content-Type':
            contentTypeMap[path.extname(filePath)] ?? 'text/plain',
          'Service-Worker-Allowed': '/',
        },
      }) as unknown as ReturnType<SerwistRouteResult['GET']>;
    },
  };
}
