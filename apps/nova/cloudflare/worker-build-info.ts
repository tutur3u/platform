const COMMIT = /^[a-f0-9]{40}$/u;

/** Paths the Worker serves in place. The old host is never redirected. */
const BUILD_INFO_PATHS = new Set(['/api/build-info', '/nova/api/build-info']);

export function isNovaWorkerBuildInfoGet(request: Request): boolean {
  if (request.method !== 'GET') return false;
  try {
    return BUILD_INFO_PATHS.has(new URL(request.url).pathname);
  } catch {
    return false;
  }
}

function unsealed(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store, max-age=0');
  return new Response(
    JSON.stringify({
      appName: 'nova',
      error: 'Build commit is not sealed',
    }),
    { status: 500, headers }
  );
}

/**
 * Worker-only deploy stamp. The shared Vercel handler stays free of
 * `platform` and `commit`; this adds them on the Cloudflare response.
 * A sealed commit is the same 40-hex value as `commitHash`.
 */
export async function stampNovaWorkerBuildInfo(
  request: Request,
  response: Response
): Promise<Response> {
  if (!isNovaWorkerBuildInfoGet(request) || response.status !== 200) {
    return response;
  }
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return response;

  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return unsealed(response);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return unsealed(response);
  }
  const record = body as Record<string, unknown>;
  const commitHash = record.commitHash;
  if (typeof commitHash !== 'string' || !COMMIT.test(commitHash)) {
    return unsealed(response);
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('location');
  return new Response(
    JSON.stringify(
      { ...record, commit: commitHash, platform: 'cloudflare' },
      null,
      2
    ),
    { status: 200, headers }
  );
}
