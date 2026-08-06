import { getPlatformReleaseInfo } from './platform-release';

/**
 * Answer "which commit is actually serving this app right now?" over HTTP.
 *
 * The build metadata has always been generated into the bundle, but nothing
 * exposed it at runtime, so the only way to check what a deployment contained
 * was to infer it. That inference is unreliable: a deployment cancelled by a
 * later push can leave an app serving code from before a merge while every
 * workflow reports success, and `vercel inspect` returns no git metadata for
 * these projects. Without this endpoint, "is my fix live?" is unanswerable.
 *
 * Returns a plain `Response` so route handlers in every app can re-export it
 * without this module depending on a framework.
 */
export function createBuildInfoHandler(appName: string) {
  return function GET(): Response {
    const info = getPlatformReleaseInfo(appName);

    return new Response(JSON.stringify(info, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // Never let a CDN answer this: a cached build stamp is worse than none.
        'cache-control': 'no-store, max-age=0',
      },
      status: 200,
    });
  };
}
