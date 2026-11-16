const SHA40 = /^[a-f0-9]{40}$/;

export type ColabBuildInfo = {
  appName: 'colab';
  commit: string | null;
  commitHash: string | null;
  platform: 'cloudflare';
};

export function colabBuildInfo(commit: string): ColabBuildInfo {
  const stamp = commit.trim().toLowerCase();
  const sha = SHA40.test(stamp) ? stamp : null;
  return {
    appName: 'colab',
    commit: sha,
    commitHash: sha,
    platform: 'cloudflare',
  };
}

export function colabBuildInfoResponse(
  method: string,
  commit: string
): Response {
  const allow = 'GET, HEAD, OPTIONS';
  const cache = 'no-store, max-age=0';
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { Allow: allow, 'cache-control': cache },
    });
  }
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response(null, {
      status: 405,
      headers: { Allow: allow, 'cache-control': cache },
    });
  }
  const json = JSON.stringify(colabBuildInfo(commit));
  return new Response(method === 'HEAD' ? null : json, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache,
    },
  });
}
