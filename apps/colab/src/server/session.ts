import { type Identity, RoomError } from '@tuturuuu/multiplayer';
import { authenticate, sessionCookie, sign } from './auth';
import type { Env } from './env';

const centralCookie = /^sb-[a-z0-9-]+-auth-token(?:\.\d+)?=/;
const renewalWindow = 5 * 60_000;

export function centralAuthCookies(request: Request) {
  return (request.headers.get('cookie') ?? '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => centralCookie.test(value))
    .join('; ');
}

export function renewedCentralCookies(response: Response) {
  return response.headers
    .getSetCookie()
    .filter((value) => centralCookie.test(value));
}

/** Revalidate with central Auth; never renew from an expired Colab token alone. */
export async function resolveSession(
  request: Request,
  env: Env,
  cookies: string[]
) {
  const current = await authenticate(request, env);
  if (
    current &&
    (!current.email || current.expires > Date.now() + renewalWindow)
  )
    return current;
  const central = centralAuthCookies(request);
  if (!central) return current;
  let response: Response;
  try {
    response = await fetch(new URL('/api/auth/me', env.AUTH_ORIGIN), {
      headers: {
        Cookie: central,
        Origin: env.APP_ORIGIN,
        'User-Agent': 'Tuturuuu-Colab/1.0',
      },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new RoomError('session_unavailable', 503);
  }
  if (response.status === 401 || response.status === 403) {
    cookies.push(...renewedCentralCookies(response), sessionCookie('', 0));
    return null;
  }
  if (!response.ok) throw new RoomError('session_unavailable', 503);
  const data = (await response.json().catch(() => null)) as {
    user?: {
      id?: string;
      email?: string;
      email_confirmed_at?: string;
      banned_until?: string;
      user_metadata?: {
        display_name?: string;
        full_name?: string;
        avatar_url?: string;
      };
    };
  } | null;
  const user = data?.user;
  if (typeof user?.id !== 'string' || typeof user.email !== 'string')
    throw new RoomError('session_unavailable', 503);
  if (
    !user.email ||
    !user.email_confirmed_at ||
    (user.banned_until && Date.parse(user.banned_until) > Date.now())
  ) {
    cookies.push(sessionCookie('', 0));
    return null;
  }
  const sameAccount = current?.id === user.id;
  const name = sameAccount
    ? current.name
    : user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      user.email.split('@')[0];
  const avatar = sameAccount
    ? current.avatarUrl
    : user.user_metadata?.avatar_url;
  const identity: Identity = {
    id: user.id,
    email: user.email,
    name: typeof name === 'string' ? name.slice(0, 120) : 'Member',
    avatarUrl:
      typeof avatar === 'string' &&
      /^https:\/\//i.test(avatar) &&
      avatar.length <= 1024
        ? avatar
        : undefined,
    expires: Date.now() + 3600_000,
  };
  cookies.push(
    ...renewedCentralCookies(response),
    sessionCookie(await sign(identity, env.COLAB_SESSION_SECRET), 3600)
  );
  return identity;
}
