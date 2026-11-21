import { offlineWorkerResponse } from './serve-offline-worker';
import type { OfflineRouteResult, OfflineWorkerFile } from './types';

/**
 * Serves service-worker files that `buildOfflineWorker` produced at build
 * time. It imports no compiler or Node API, so it runs where the source
 * cannot be bundled per request, such as a Cloudflare Worker.
 */
export function createPrebuiltOfflineRoute(
  files: readonly OfflineWorkerFile[]
): OfflineRouteResult {
  const contents = new Map(files.map((file) => [file.path, file.contents]));

  return {
    generateStaticParams: async () =>
      [...contents.keys()].map((filePath) => ({ path: filePath })),
    GET: async (_, context) => {
      const { path: filePath } = await context.params;
      return offlineWorkerResponse(
        contents.get(filePath),
        filePath.match(/\.[^./]+$/u)?.[0] ?? ''
      );
    },
  };
}

export type { OfflineRouteResult, OfflineWorkerFile } from './types';
