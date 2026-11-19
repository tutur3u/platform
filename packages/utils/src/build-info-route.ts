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

/**
 * Minimal public variant: the serving commit and build time only, with no
 * release notes or version fields. Apps whose API sits behind an app-session
 * guard expose this so a deploy can be verified without credentials.
 */
export function createPublicBuildInfoHandler(appName: string) {
  return function GET(): Response {
    const info = getPlatformReleaseInfo(appName);

    return new Response(
      JSON.stringify(
        {
          appName: info.appName,
          commitHash: info.commitHash,
          shortCommitHash: info.shortCommitHash,
          builtAt: info.builtAt,
        },
        null,
        2
      ),
      {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store, max-age=0',
        },
        status: 200,
      }
    );
  };
}

/** True for the unauthenticated build-stamp probe (GET or HEAD /api/build-info). */
export function isPublicBuildInfoRequest(request: {
  method: string;
  nextUrl: { pathname: string };
}): boolean {
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    request.nextUrl.pathname === '/api/build-info'
  );
}
