const HEADER = 'x-lettin-profile-proxy';

type Stage =
  | 'canonical-locale'
  | 'canonical-public'
  | 'verify-token'
  | 'login'
  | 'auth-login'
  | 'workspace-route-status'
  | 'intl';

type Environment = Record<string, string | undefined>;
type RequestShape = { url: string; nextUrl: { pathname: string } };
type DocumentRequest = RequestShape & { method: string; headers: Headers };
export const PROFILE_REQUEST_HEADER = 'x-lettin-profile-request-id';
const requestIds = new WeakMap<RequestShape, string>();
export const validProfileRequestId = (value: string | null): value is string =>
  typeof value === 'string' && /^[a-f0-9]{32}$/u.test(value);

function locale(pathname: string) {
  return pathname.match(/^\/(en|vi)(?=\/)/u)?.[1] ?? 'unprefixed';
}

export function profileDiagnosticRequest(
  request: RequestShape,
  env: Environment = process.env
): boolean {
  if (
    env.TUTURUUU_LETTIN_PROFILE_DIAGNOSTICS !== '1' ||
    env.NODE_ENV !== 'development' ||
    env.GITHUB_ACTIONS !== 'true' ||
    env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    !/^\d+$/u.test(env.GITHUB_RUN_ID ?? '') ||
    !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA ?? '') ||
    env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined ||
    env.CLOUDFLARE_API_TOKEN !== undefined ||
    env.SUPABASE_ACCESS_TOKEN !== undefined
  )
    return false;
  try {
    const url = new URL(request.url);
    if (
      !['http://127.0.0.1:7833', 'http://localhost:7833'].includes(
        url.origin
      ) ||
      url.username ||
      url.password ||
      !/^\/(?:en\/|vi\/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/profile\/?$/iu.test(
        url.pathname
      )
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

// This marker is set only after the disposable hosted fixture's preflight.
// Values describe response production; they never admit or alter a session.
export function tagProfileProxyResponse<T extends { headers: Headers }>(
  request: RequestShape,
  response: T,
  stage: Stage,
  env: Environment = process.env
): T {
  if (!profileDiagnosticRequest(request, env)) return response;
  try {
    const url = new URL(request.url);
    const id = requestIds.get(request);
    if (id) response.headers.set(PROFILE_REQUEST_HEADER, id);
    response.headers.set(
      HEADER,
      [
        stage,
        locale(url.pathname),
        locale(request.nextUrl.pathname),
        url.pathname === request.nextUrl.pathname ? 'same' : 'different',
      ].join('|')
    );
  } catch {
    // Diagnostics must preserve the original response even for malformed URLs.
  }
  return response;
}

// Entry runs before auth, locale handling, or rendering. Incoming IDs are never trusted.
export function beginProfileRequest(
  request: DocumentRequest,
  env: Environment = process.env
): string | undefined {
  try {
    request.headers.delete(PROFILE_REQUEST_HEADER);
    if (
      !profileDiagnosticRequest(request, env) ||
      request.method !== 'GET' ||
      !request.headers.get('accept')?.includes('text/html') ||
      request.headers.get('sec-fetch-dest') !== 'document'
    )
      return;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const id = Array.from(bytes, (value) =>
      value.toString(16).padStart(2, '0')
    ).join('');
    request.headers.set(PROFILE_REQUEST_HEADER, id);
    requestIds.set(request, id);
    try {
      console.info(
        '[lettin-profile-read]',
        JSON.stringify({
          version: 1,
          requestId: id,
          stage: 'proxy',
          event: 'entry',
          elapsedMs: 0,
        })
      );
    } catch {
      /* Diagnostics cannot change request outcomes. */
    }
    return id;
  } catch {
    return;
  }
}
