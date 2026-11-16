export const BUILD_INFO_PATHS = [
  '/api/build-info',
  '/roadmap/api/build-info',
] as const;

const COMMIT = /^[a-f0-9]{40}$/;

export function isBuildInfoPath(pathname: string): boolean {
  return (BUILD_INFO_PATHS as readonly string[]).includes(pathname);
}

/** Public deploy stamp. Never cache it: a stale commit is worse than a miss. */
export function buildInfoResponse(commit: string, method = 'GET'): Response {
  const headers = {
    'cache-control': 'no-store, max-age=0',
    'content-type': 'application/json; charset=utf-8',
  };
  if (!COMMIT.test(commit)) {
    return new Response(
      JSON.stringify({
        appName: 'roadmap',
        error: 'Build commit is not sealed',
      }),
      { status: 500, headers }
    );
  }
  const body = JSON.stringify(
    { appName: 'roadmap', commit, commitHash: commit },
    null,
    2
  );
  return new Response(method === 'HEAD' ? null : body, {
    status: 200,
    headers,
  });
}
