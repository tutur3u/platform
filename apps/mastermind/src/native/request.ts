import { MASTERMIND_HANDOFF_ISSUER_PARAM } from '@tuturuuu/auth/app-redeem-proof';
import {
  type AppMountConfig,
  type ResolvedMount,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
import {
  type Admitted,
  authenticate,
  type MastermindEnvironment,
  ownerIds,
  sessionSubject,
} from './auth';
import { fleetReturnPath, isFleetPath } from './fleet-admission';
import { legacyLocaleRedirect } from './locale-path';
import { noticePage, workerLoginHref } from './notice';
import {
  CLEAR_LOGIN_STATE,
  clearedSessionCookies,
  consumeLoginState,
  hostSessionRequest,
  exchangeHandoff,
  hasCentralSessionHint,
  isHandoffToken,
  loginRedirect,
  readCookie,
  refreshSession,
  safeNextPath,
  sessionCookies,
  withSessionCookie,
} from './session';

/**
 * Only the dedicated host is admitted. `tuturuuu.com/mastermind` is refused:
 * on the shared origin any Web script could drive this app with the owner's
 * credentials (mastermind-web.mdx#no-apex-path-hosting).
 */
export const mastermindMount = {
  app: 'mastermind',
  rootHosts: ['mastermind.tuturuuu.com'],
  unknownHost: 'reject',
} satisfies AppMountConfig;

/**
 * Documents run only scripts stamped with this response's nonce (and what
 * they load, via 'strict-dynamic'); responses without one run no scripts.
 * Styles stay same-origin: no 'unsafe-inline'.
 */
export function contentSecurityPolicy(nonce?: string) {
  return [
    "default-src 'self'",
    nonce
      ? `script-src 'nonce-${nonce}' 'strict-dynamic'`
      : "script-src 'none'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' wss://mastermind-store.tuturuuu.com",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function secure(response: Response, nonce?: string) {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', contentSecurityPolicy(nonce));
  headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('x-tuturuuu-runtime', 'native');
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Server functions are the only mutation path: POST under the app's
 * `_serverFn` base, from this exact origin. Start's CSRF middleware checks
 * the same request again inside the handler.
 */
function admitsMethod(request: Request, url: URL, mount: ResolvedMount) {
  if (request.method === 'GET' || request.method === 'HEAD') return true;
  if (request.method !== 'POST') return false;
  if (!url.pathname.startsWith(`${mount.basePath}/_serverFn/`)) return false;
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  return (
    request.headers.get('Origin') === url.origin &&
    (fetchSite === null || fetchSite === 'same-origin')
  );
}

/**
 * Set while an owner's second-factor step-up is under way, so a session that
 * still lacks MFA after it gets the notice instead of another round trip.
 */
const MFA_STEP_COOKIE = '__Host-mastermind_mfa_step';
const MFA_STEP_SECONDS = 600;
const START_MFA_STEP = `${MFA_STEP_COOKIE}=1; Path=/; Max-Age=${MFA_STEP_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
const CLEAR_MFA_STEP = `${MFA_STEP_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

function isNavigation(request: Request) {
  return (
    request.method === 'GET' &&
    request.headers.get('Sec-Fetch-Mode') === 'navigate'
  );
}

/** The owner's session lacks a second-factor check from the last day. */
const MFA_REQUIRED =
  'Mastermind needs a multi-factor authentication check from the last 24 hours. Sign out of Tuturuuu, sign in again with your second factor, then reopen Mastermind.\n' +
  'Mastermind cần một lần xác thực đa yếu tố trong 24 giờ qua. Hãy đăng xuất khỏi Tuturuuu, đăng nhập lại bằng yếu tố thứ hai, rồi mở lại Mastermind.\n';

export async function mastermindRequest(
  request: Request,
  env: MastermindEnvironment,
  render: (
    request: Request,
    owner: Admitted,
    mount: ResolvedMount
  ) => Promise<Response> | Response,
  now = Date.now(),
  nonce?: string
) {
  request = hostSessionRequest(request);
  const url = new URL(request.url);
  const mount =
    url.protocol === 'https:' ? resolveAppBase(url, mastermindMount) : null;
  if (!mount) return secure(new Response('Forbidden', { status: 403 }));
  // Legacy `/en/...` links move to the unprefixed path before any session
  // work, so they never start a sign-in for the old address.
  if (request.method === 'GET' || request.method === 'HEAD') {
    const moved = legacyLocaleRedirect(url);
    if (moved) return secure(moved);
  }
  // The verified Tuturuuu session is the only identity; no request header
  // names the user. Login and its callback come first, so anyone can start a
  // sign-in, and only a session the Worker accepts is issued.
  const isOwner = (subject: string) => ownerIds(env).includes(subject);
  if (request.method === 'GET' && url.pathname === '/login') {
    // A signed-in grantee returns only to the Fleet page; the callback below
    // applies the same rule to the subject Web verifies. Choosing another
    // account keeps the destination, since the chosen account decides it.
    const next = safeNextPath(url.searchParams.get('nextUrl') ?? '/');
    const chooseAccount = url.searchParams.get('account') === 'choose';
    const signedIn = sessionSubject(request, env, now);
    return secure(
      await loginRedirect(
        signedIn && !isOwner(signedIn) && !chooseAccount
          ? fleetReturnPath(next)
          : next,
        env,
        {
          // `mfa=fresh` is the step-up before a reply: the second factor is
          // verified again even when the session already holds one.
          freshMfa: url.searchParams.get('mfa') === 'fresh',
          // `account=choose` lets the person pick another Tuturuuu account.
          chooseAccount,
          signedIn: hasCentralSessionHint(request),
        },
        now
      )
    );
  }
  if (request.method === 'GET' && url.pathname === '/verify-token') {
    // The login state must match this browser's, a malformed token never
    // reaches Web, and Web redeems the handoff only with this browser's
    // verifier.
    const state = consumeLoginState(request, url.searchParams.get('nextUrl'));
    const token = url.searchParams.get('token');
    const issuerProof = url.searchParams.get(MASTERMIND_HANDOFF_ISSUER_PARAM);
    const session =
      state && isHandoffToken(token)
        ? await exchangeHandoff(
            token,
            state.verifier,
            env,
            now,
            fetch,
            issuerProof ?? undefined
          )
        : null;
    if (!state || !session) {
      const retry = safeNextPath(url.searchParams.get('nextUrl'));
      const back = new URL(retry, 'https://mastermind.tuturuuu.com');
      back.searchParams.delete('mm_state');
      const path = `${back.pathname}${back.search}`;
      return secure(
        noticePage('signInFailed', path, workerLoginHref(path), {
          'Set-Cookie': CLEAR_LOGIN_STATE,
        })
      );
    }
    const next = state.next;
    // A grantee always returns to the Fleet page.
    const headers = new Headers({
      Location: isOwner(session.userId) ? next : fleetReturnPath(next),
    });
    headers.append('Set-Cookie', CLEAR_LOGIN_STATE);
    for (const cookie of sessionCookies(session))
      headers.append('Set-Cookie', cookie);
    return secure(new Response(null, { status: 303, headers }));
  }

  // A non-owner session reaches Fleet paths only: anything else is 403
  // before any refresh, permission call or render.
  const fleetPath = isFleetPath(request.method, url, mount.basePath);
  const subject = sessionSubject(request, env, now);
  const here = safeNextPath(`${url.pathname}${url.search}`);
  const wrongAccount = () =>
    secure(
      isNavigation(request)
        ? noticePage(
            'wrongAccount',
            here,
            workerLoginHref(here, { account: 'choose' })
          )
        : new Response('Forbidden', { status: 403 })
    );
  if (subject && !isOwner(subject) && !fleetPath) return wrongAccount();

  let admitted = request;
  let owner = await authenticate(request, env, now, fleetPath);
  let issued: string[] = [];
  if (!owner) {
    // An expired access session rotates its refresh credential inline.
    const session = await refreshSession(request, env, now);
    if (session) {
      admitted = withSessionCookie(request, session);
      owner = await authenticate(admitted, env, now, fleetPath);
      if (owner) issued = sessionCookies(session);
    }
  }
  if (owner === 'forbidden') return wrongAccount();
  if (owner === 'mfa') {
    // Refresh would carry the stale proof forward, so the session is dropped.
    // A navigation starts the second-factor step-up in the sign-in itself;
    // Web hands back a session only with a just-verified factor. Once a
    // step-up is under way, or for any other request, the notice answers.
    const cleared = clearedSessionCookies();
    if (isNavigation(request) && !readCookie(request, MFA_STEP_COOKIE)) {
      const step = await loginRedirect(here, env, { freshMfa: true }, now);
      for (const cookie of cleared) step.headers.append('Set-Cookie', cookie);
      step.headers.append('Set-Cookie', START_MFA_STEP);
      return secure(step);
    }
    const headers = new Headers();
    for (const cookie of [...cleared, CLEAR_MFA_STEP])
      headers.append('Set-Cookie', cookie);
    if (isNavigation(request)) {
      return secure(
        noticePage(
          'mfa',
          here,
          workerLoginHref(here, { mfa: 'fresh' }),
          headers
        )
      );
    }
    headers.set('Content-Type', 'text/plain; charset=utf-8');
    return secure(new Response(MFA_REQUIRED, { status: 403, headers }));
  }
  if (!owner) {
    if (request.method === 'GET' && url.pathname === '/') {
      return secure(
        new Response(null, { status: 303, headers: { Location: '/login' } })
      );
    }
    return isNavigation(request)
      ? secure(
          await loginRedirect(
            fleetPath ? fleetReturnPath(here) : here,
            env,
            { signedIn: hasCentralSessionHint(request) },
            now
          )
        )
      : secure(new Response('Forbidden', { status: 403 }));
  }
  if (!admitsMethod(request, url, mount)) {
    return secure(new Response('Method not allowed', { status: 405 }));
  }
  const response = secure(await render(admitted, owner, mount), nonce);
  for (const cookie of issued) response.headers.append('Set-Cookie', cookie);
  // A step-up ends only once a request is admitted with the new proof.
  if (readCookie(request, MFA_STEP_COOKIE))
    response.headers.append('Set-Cookie', CLEAR_MFA_STEP);
  return response;
}
