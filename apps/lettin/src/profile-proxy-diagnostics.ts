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

function locale(pathname: string) {
  return pathname.match(/^\/(en|vi)(?=\/)/u)?.[1] ?? 'unprefixed';
}

// This marker is set only after the disposable hosted fixture's preflight.
// Values describe response production; they never admit or alter a session.
export function tagProfileProxyResponse<T extends { headers: Headers }>(
  request: RequestShape,
  response: T,
  stage: Stage,
  env: Environment = process.env
): T {
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
    return response;
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
      return response;
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
