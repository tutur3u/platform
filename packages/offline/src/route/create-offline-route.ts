import path from 'node:path';
import { buildOfflineWorker, getGitRevision } from './build-offline-worker';
import { offlineWorkerResponse } from './serve-offline-worker';
import type { OfflineRouteConfig, OfflineRouteResult } from './types';

/**
 * Creates the build-time route that serves Tuturuuu's internally owned worker.
 * The legacy `/serwist/sw.js` URL remains stable for installed workers.
 */
export function createOfflineRoute(
  config: OfflineRouteConfig = {}
): OfflineRouteResult {
  const { disableInDev = true, revision = getGitRevision() } = config;

  if (disableInDev && process.env.NODE_ENV === 'development') {
    return {
      generateStaticParams: async () => [],
      GET: async () => new Response(null, { status: 204 }),
    };
  }

  const cwd = process.cwd();
  let outputFiles: Map<string, string> | null = null;

  const loadOutputFiles = async () => {
    if (outputFiles) {
      return outputFiles;
    }

    const files = await buildOfflineWorker({ ...config, revision }, cwd);
    outputFiles = new Map(
      files.map((file) => [
        path.join(/* turbopackIgnore: true */ cwd, file.path),
        file.contents,
      ])
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
      return offlineWorkerResponse(
        files.get(path.join(/* turbopackIgnore: true */ cwd, filePath)),
        path.extname(filePath)
      );
    },
  };
}

/** @deprecated Use `createOfflineRoute`. */
export const createSerwistRoute = createOfflineRoute;
