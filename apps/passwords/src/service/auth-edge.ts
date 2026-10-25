import {
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_REFRESH_COOKIE_NAME,
  verifyAppSessionRefreshToken,
  verifyAppSessionToken,
} from '@tuturuuu/auth/app-session-core';
import {
  callbackState,
  configuredOrigin,
  cookie,
  createLoginAttempt,
  LOGIN_COOKIE,
  LOGIN_TTL_SECONDS,
  readBoundedJson,
  readLoginAttempt,
  redirect,
  response,
  safeNext,
  setCookie,
} from './auth-edge-protocol';
import type { PasswordsEnvironment } from './environment';
import { evaluateStepUp } from './step-up';
import { isPasswordsEnabled } from './stop-fence';

type AuthEnvironment = Pick<
  PasswordsEnvironment,
  | 'PASSWORDS_ENABLED'
  | 'NEXT_PUBLIC_APP_URL'
  | 'NEXT_PUBLIC_WEB_APP_URL'
  | 'TUTURUUU_APP_COORDINATION_SECRET'
>;
type Dependencies = {
  fetch?: typeof fetch;
  now?: () => number;
  /** Explicit fixture injection only; production never enables HTTP. */
  allowLoopbackForTests?: boolean;
};
type SessionPair = {
  access: Extract<ReturnType<typeof verifyAppSessionToken>, { ok: true }>;
  refresh: Extract<
    ReturnType<typeof verifyAppSessionRefreshToken>,
    { ok: true }
  >;
  accessToken: string;
  refreshToken: string;
};

export function createPasswordsAuthEdge(
  env: AuthEnvironment,
  dependencies: Dependencies = {}
) {
  const now = dependencies.now ?? (() => Math.floor(Date.now() / 1000));
  const transport = dependencies.fetch ?? fetch;

  return {
    async handle(request: Request): Promise<Response | null> {
      if (!isPasswordsEnabled(env)) return response({ code: 'STOPPED' }, 503);
      let callback = false;
      try {
        const url = new URL(request.url);
        const path = url.pathname.replace(/^\/(?:en|vi)(?=\/)/u, '');
        callback = path === '/verify-token';
        const origin = configuredOrigin(
          env.NEXT_PUBLIC_APP_URL,
          dependencies.allowLoopbackForTests
        );
        const central = configuredOrigin(
          env.NEXT_PUBLIC_WEB_APP_URL,
          dependencies.allowLoopbackForTests
        );
        const secret = env.TUTURUUU_APP_COORDINATION_SECRET?.trim();
        if (!secret) throw new Error('Invalid authentication configuration');
        if (url.origin !== origin)
          return response({ code: 'INVALID_ORIGIN' }, 403);
        const options = {
          secret,
          targetApp: 'passwords',
          now: new Date(now() * 1000),
        };
        const accessToken = cookie(request, APP_SESSION_COOKIE_NAME);
        const refreshToken = cookie(request, APP_SESSION_REFRESH_COOKIE_NAME);
        const access = accessToken
          ? verifyAppSessionToken(accessToken, options)
          : null;
        const refresh = refreshToken
          ? verifyAppSessionRefreshToken(refreshToken, options)
          : null;
        const subject = access?.ok
          ? access.claims.sub
          : refresh?.ok
            ? refresh.claims.sub
            : null;
        if (
          access?.ok &&
          refresh?.ok &&
          access.claims.sub !== refresh.claims.sub &&
          path !== '/api/auth/logout'
        )
          return callback
            ? redirect('/api/auth/error')
            : response({ code: 'AUTH_REQUIRED' }, 401);

        const issue = (pair: SessionPair, result: Response) => {
          setCookie(
            result,
            APP_SESSION_COOKIE_NAME,
            pair.accessToken,
            pair.access.claims.exp - now()
          );
          setCookie(
            result,
            APP_SESSION_REFRESH_COOKIE_NAME,
            pair.refreshToken,
            pair.refresh.claims.exp - now()
          );
          return result;
        };

        const exchange = async (
          endpoint: string,
          payload: Record<string, string>
        ): Promise<SessionPair | null> => {
          const result = await transport(new URL(endpoint, central), {
            method: 'POST',
            body: JSON.stringify({ ...payload, targetApp: 'passwords' }),
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(5000),
          });
          if (!result.ok) return null;
          const body = await readBoundedJson(result);
          if (!body || typeof body !== 'object') return null;
          const tokens = body as Record<string, unknown>;
          if (
            typeof tokens.appSessionToken !== 'string' ||
            typeof tokens.appSessionRefreshToken !== 'string'
          )
            return null;
          const verifiedAccess = verifyAppSessionToken(
            tokens.appSessionToken,
            options
          );
          const verifiedRefresh = verifyAppSessionRefreshToken(
            tokens.appSessionRefreshToken,
            options
          );
          if (
            !verifiedAccess.ok ||
            !verifiedRefresh.ok ||
            !verifiedAccess.claims.sub ||
            verifiedAccess.claims.sub !== verifiedRefresh.claims.sub ||
            (subject && verifiedAccess.claims.sub !== subject)
          )
            return null;
          return {
            access: verifiedAccess,
            refresh: verifiedRefresh,
            accessToken: tokens.appSessionToken,
            refreshToken: tokens.appSessionRefreshToken,
          };
        };

        const start = (next: string, stepUp: boolean) => {
          const { attempt, sealed } = createLoginAttempt(
            next,
            subject,
            stepUp,
            now(),
            secret
          );
          const target = new URL(next, origin);
          target.searchParams.set('state', attempt.nonce);
          const locale =
            next.startsWith('/vi/') || next === '/vi' ? 'vi' : 'en';
          const login = new URL(
            `/${locale}/${stepUp ? 'step-up' : 'login'}`,
            central
          );
          login.searchParams.set(
            stepUp ? 'next' : 'returnUrl',
            target.toString()
          );
          if (stepUp) login.searchParams.set('app', 'passwords');
          const result = redirect(login.toString());
          setCookie(result, LOGIN_COOKIE, sealed, LOGIN_TTL_SECONDS);
          return result;
        };

        if (path === '/api/auth/error')
          return response({ code: 'AUTH_FAILED' }, 401);
        if (path === '/api/auth/step-up') {
          if (request.method !== 'GET')
            return response({ code: 'METHOD_NOT_ALLOWED' }, 405);
          const next = safeNext(url.searchParams.get('next'), origin);
          if (!next || !subject)
            return response({ code: 'AUTH_REQUIRED' }, 401);
          // A cross-site navigation cannot replace an outstanding login attempt.
          if (request.headers.get('sec-fetch-site') === 'cross-site')
            return response({ code: 'INVALID_ORIGIN' }, 403);
          return start(next, true);
        }

        const verifyPost = path === '/api/auth/verify-app-token';
        const refreshPost = path === '/api/auth/refresh-app-session';
        const logoutPost = path === '/api/auth/logout';
        if (verifyPost || refreshPost || logoutPost) {
          if (request.method !== 'POST')
            return response({ code: 'METHOD_NOT_ALLOWED' }, 405);
          if (request.headers.get('origin') !== origin)
            return response({ code: 'INVALID_ORIGIN' }, 403);
        }
        if (logoutPost) {
          const result = response({ ok: true });
          for (const name of [
            APP_SESSION_COOKIE_NAME,
            APP_SESSION_REFRESH_COOKIE_NAME,
            LOGIN_COOKIE,
          ])
            setCookie(result, name, '', 0);
          return result;
        }
        if (callback || verifyPost) {
          if (callback && request.method !== 'GET')
            return response({ code: 'METHOD_NOT_ALLOWED' }, 405);
          const failed = () =>
            callback
              ? redirect(`${origin}/api/auth/error`)
              : response({ code: 'AUTH_FAILED' }, 401);
          const body = verifyPost ? await readBoundedJson(request, 8192) : null;
          const input =
            body && typeof body === 'object'
              ? (body as Record<string, unknown>)
              : {};
          const token = callback ? url.searchParams.get('token') : input.token;
          const state = callback ? callbackState(url) : input.state;
          const attempt = readLoginAttempt(
            cookie(request, LOGIN_COOKIE),
            origin,
            now(),
            secret
          );
          if (
            typeof token !== 'string' ||
            !token ||
            token.length > 4096 ||
            (callback && url.searchParams.getAll('token').length !== 1) ||
            !attempt ||
            state !== attempt.nonce ||
            (attempt.subject && subject !== attempt.subject)
          )
            return failed();
          // Correlate before the central verifier consumes the one-time code.
          const pair = await exchange('/api/v1/auth/cross-app-token/verify', {
            token,
          });
          if (
            !pair ||
            (attempt.subject && pair.access.claims.sub !== attempt.subject) ||
            (attempt.stepUp &&
              !evaluateStepUp(pair.access.claims.mfa, now()).fresh)
          )
            return failed();
          const result = issue(
            pair,
            callback
              ? redirect(new URL(attempt.next, origin).toString())
              : response({ valid: true, nextUrl: attempt.next })
          );
          setCookie(result, LOGIN_COOKIE, '', 0);
          return result;
        }
        if (refreshPost) {
          if (!refresh?.ok || !refreshToken)
            return response({ code: 'AUTH_REQUIRED' }, 401);
          const pair = await exchange(
            '/api/v1/auth/cross-app-session/refresh',
            { refreshToken }
          );
          if (!pair) return response({ code: 'AUTH_UNAVAILABLE' }, 503);
          // The central refresh must preserve the old assurance, never mint fresh MFA.
          if (
            JSON.stringify(pair.access.claims.mfa) !==
              JSON.stringify(refresh.claims.mfa) ||
            JSON.stringify(pair.refresh.claims.mfa) !==
              JSON.stringify(refresh.claims.mfa)
          )
            return response({ code: 'AUTH_UNAVAILABLE' }, 503);
          return issue(pair, response({ valid: true }));
        }
        if (access?.ok) return null;
        const bearer = request.headers
          .get('authorization')
          ?.match(/^Bearer ([^\s]+)$/iu)?.[1];
        if (bearer && verifyAppSessionToken(bearer, options).ok) return null;
        if (
          (request.method === 'GET' || request.method === 'HEAD') &&
          request.headers.get('accept')?.includes('text/html')
        ) {
          return start(
            safeNext(`${url.pathname}${url.search}`, origin) ?? '/en',
            false
          );
        }
        return response({ code: 'AUTH_REQUIRED' }, 401);
      } catch {
        return callback
          ? redirect('/api/auth/error')
          : response({ code: 'AUTH_UNAVAILABLE' }, 503);
      }
    },
  };
}
