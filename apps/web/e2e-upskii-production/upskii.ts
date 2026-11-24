import { randomUUID } from 'node:crypto';
import { call, type FetchLike, jsonInit } from './http';
import { HOSTS, isUpskiiQaEmail, LIMITS, on } from './policy';

/**
 * Upskii clients: the admin QA provisioner (per-run identities, seed class,
 * purge) behind UPSKII_QA_PROVISIONER_TOKEN, and signed-in product calls on
 * app.upskii.com made exactly like the browser does (same-origin headers).
 */

export type UpskiiRole = 'teacher' | 'student' | 'outsider';

export interface UpskiiIdentity {
  userId: string;
  email: string;
  role: UpskiiRole;
  password?: string;
}

export type PurgeMode = 'dry-run' | 'apply' | 'verify';
export interface PurgeResult {
  counts: Record<string, number>;
  more?: boolean;
  purge?: { clean?: boolean; identity?: string };
}

const QA = '/api/admin/qa/users';

export function upskiiProvisioner(token: string, fetchImpl: FetchLike = fetch) {
  const auth = { authorization: `Bearer ${token}` };
  const req = (
    label: string,
    path: string,
    init: RequestInit & { expect?: number[] } = {}
  ) =>
    call(fetchImpl, label, on('upskiiAdmin', path), {
      ...init,
      headers: { ...(init.headers as object), ...auth },
    });

  const identity = (value: unknown): UpskiiIdentity => {
    const id = value as UpskiiIdentity;
    if (!isUpskiiQaEmail(id?.email))
      throw new Error('Upskii provisioner returned a non-QA address');
    return id;
  };

  return {
    async create(runLabel: string, role: UpskiiRole) {
      const { json } = await req('upskii qa create', QA, {
        ...jsonInit('POST', {
          requestId: randomUUID(),
          runLabel,
          role,
          ttlSeconds: LIMITS.tuturuuuRunTtlSeconds,
        }),
        expect: [200, 201],
      });
      return identity((json as { user?: unknown }).user ?? json);
    },

    async list(filter: { runLabel?: string; active?: boolean }) {
      const query = new URLSearchParams();
      if (filter.runLabel) query.set('runLabel', filter.runLabel);
      if (filter.active) query.set('active', '1');
      const { json } = await req('upskii qa list', `${QA}?${query}`, {
        headers: { 'x-qa-request-id': randomUUID() },
      });
      const page = json as { users?: unknown[]; more?: boolean };
      // Pages hold at most 100; callers purge and re-list while `more`.
      return {
        more: page.more === true,
        users: (page.users ?? [])
          .filter((u) => isUpskiiQaEmail((u as UpskiiIdentity).email))
          .map((u) => u as UpskiiIdentity & { runLabel?: string }),
      };
    },

    async seedClass(userId: string) {
      const { json } = await req(
        'upskii qa seed class',
        `${QA}/${encodeURIComponent(userId)}`,
        { ...jsonInit('POST', { requestId: randomUUID() }), expect: [200, 201] }
      );
      const classId = (json as { classId?: unknown }).classId;
      if (typeof classId !== 'string') throw new Error('Seed class: no id');
      return classId;
    },

    async purge(userId: string, mode: PurgeMode): Promise<PurgeResult> {
      const { json } = await req(
        `upskii qa purge ${mode}`,
        `${QA}/${encodeURIComponent(userId)}/purge`,
        jsonInit('POST', { requestId: randomUUID(), mode })
      );
      return json as PurgeResult;
    },
  };
}

export type UpskiiProvisioner = ReturnType<typeof upskiiProvisioner>;

/** Password sign-in through the auth authority; returns the session cookie. */
export async function upskiiSignIn(
  identity: UpskiiIdentity,
  fetchImpl: FetchLike = fetch
): Promise<string> {
  if (!identity.password) throw new Error('Identity has no password');
  const intent = identity.role === 'teacher' ? 'teacher' : 'student';
  const response = await fetchImpl(on('upskiiAuth', '/api/auth/password'), {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(LIMITS.requestTimeoutMs),
    headers: { origin: HOSTS.upskiiApp, 'sec-fetch-site': 'same-site' },
    body: new URLSearchParams({
      email: identity.email,
      password: identity.password,
      intent,
      returnTo: `${HOSTS.upskiiApp}/`,
    }),
  });
  await response.body?.cancel();
  if (response.status !== 303) throw new Error('Upskii sign-in failed');
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(';', 1)[0] ?? '')
    .find((pair) =>
      /^(?:__Secure-)?upskii\.session_token=[^\s;,]+$/u.test(pair)
    );
  if (!cookie) throw new Error('Upskii session was not issued');
  return cookie;
}

/** Signed-in product API caller for app.upskii.com. */
export function upskiiApp(cookie: string, fetchImpl: FetchLike = fetch) {
  const headers = {
    cookie,
    origin: HOSTS.upskiiApp,
    'sec-fetch-site': 'same-origin',
    accept: 'application/json',
  };
  return (
    label: string,
    path: string,
    init: RequestInit & { expect?: number[] } = {}
  ) =>
    call(fetchImpl, label, on('upskiiApp', path), {
      ...init,
      headers: { ...headers, ...(init.headers as object) },
    });
}

export type UpskiiApp = ReturnType<typeof upskiiApp>;

/** Cookie pair → Playwright cookie for the shared .upskii.com scope. */
export function upskiiBrowserCookie(pair: string) {
  const index = pair.indexOf('=');
  return {
    name: pair.slice(0, index),
    value: pair.slice(index + 1),
    domain: '.upskii.com',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax' as const,
  };
}
