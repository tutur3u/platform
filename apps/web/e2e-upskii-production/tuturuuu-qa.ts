import { call, type FetchLike, jsonInit } from './http';
import { isTuturuuuQaEmail, LIMITS, on, QA_PURPOSE } from './policy';

/**
 * Client for Tuturuuu's QA test-user API, authenticated as the GitHub OIDC
 * QA operator. No stored secret: each call presents a short-lived GitHub
 * Actions ID token for the pinned audience, which the server binds to the
 * exact workflow, ref and environment.
 */

export const OIDC_AUDIENCE = 'https://tuturuuu.com/qa-operator';
const BASE = '/api/v1/admin/qa/test-users';

type Env = Record<string, string | undefined>;

export function githubOidcAuth(env: Env, fetchImpl: FetchLike = fetch) {
  let cached: { token: string; until: number } | null = null;
  return async (): Promise<Record<string, string>> => {
    if (!cached || cached.until < Date.now()) {
      const url = env.ACTIONS_ID_TOKEN_REQUEST_URL;
      const bearer = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
      if (!url || !bearer)
        throw new Error(
          'GitHub OIDC is unavailable (job needs permissions: id-token: write)'
        );
      const target = new URL(url);
      target.searchParams.set('audience', OIDC_AUDIENCE);
      const { json } = await call(fetchImpl, 'github oidc', target.toString(), {
        headers: { authorization: `Bearer ${bearer}` },
      });
      const token = (json as { value?: unknown })?.value;
      if (typeof token !== 'string') throw new Error('GitHub OIDC: no token');
      // GitHub ID tokens live ~5 minutes; refresh well before expiry.
      cached = { token, until: Date.now() + 3 * 60 * 1000 };
    }
    return {
      authorization: `Bearer ${cached.token}`,
      'x-tuturuuu-qa-operator': 'github-oidc',
    };
  };
}

export interface QaUser {
  userId: string;
  email: string;
  staff: boolean;
  password?: string;
}

export interface QaRun {
  runId: string;
  runWorkspaceId: string | null;
  users: QaUser[];
}

export interface QaListedUser {
  userId: string;
  email: string;
  runId: string;
  purpose: string;
  state: string;
  deletedAt: string | null;
  expiresAt: string;
}

export interface SessionCookie {
  name: string;
  value: string;
  domain?: string;
  path: string;
  sameSite: string;
  secure: boolean;
  httpOnly: boolean;
}

export function tuturuuuQaClient(
  auth: () => Promise<Record<string, string>>,
  fetchImpl: FetchLike = fetch
) {
  const req = async (
    label: string,
    path: string,
    init: RequestInit & { expect?: number[] } = {}
  ) =>
    call(fetchImpl, label, on('tuturuuu', path), {
      ...init,
      headers: { ...(init.headers as object), ...(await auth()) },
    });

  function checkUsers(users: QaUser[]) {
    for (const user of users)
      if (!isTuturuuuQaEmail(user.email))
        throw new Error('Tuturuuu QA API returned a non-QA address');
    return users;
  }

  return {
    /** Host first (owns the run workspace), then participants via runId. */
    async createRun(opts: {
      staff: boolean;
      runId?: string;
      count?: number;
      workspace?: boolean;
    }) {
      const body = opts.runId
        ? { count: opts.count ?? 1, runId: opts.runId, staff: opts.staff }
        : {
            count: opts.count ?? 1,
            staff: opts.staff,
            tier: opts.staff ? 'pro' : 'free',
            purpose: QA_PURPOSE,
            ttlSeconds: LIMITS.tuturuuuRunTtlSeconds,
            workspace: opts.workspace ?? true,
          };
      const { json } = await req('qa create', BASE, {
        ...jsonInit('POST', body),
        expect: [201],
      });
      const run = json as QaRun;
      checkUsers(run.users);
      return run;
    },

    async session(userId: string, origin: string) {
      const { json } = await req(
        'qa session',
        `${BASE}/${encodeURIComponent(userId)}/session`,
        { ...jsonInit('POST', { origin }), expect: [201] }
      );
      const result = json as { email: string; cookies: SessionCookie[] };
      if (!isTuturuuuQaEmail(result.email))
        throw new Error('Session minted for a non-QA address');
      return result.cookies;
    },

    async list(runId?: string): Promise<QaListedUser[]> {
      const query = runId
        ? `?run=${encodeURIComponent(runId)}&includeDeleted=1`
        : '';
      const { json } = await req('qa list', `${BASE}${query}`);
      return ((json as { users?: QaListedUser[] }).users ?? []).filter((u) =>
        isTuturuuuQaEmail(u.email)
      );
    },

    async cleanupRun(runId: string) {
      const { json } = await req('qa cleanup', `${BASE}/cleanup`, {
        ...jsonInit('POST', { runId }),
      });
      return json as {
        deleted?: string[];
        pending?: string[];
        skipped?: string[];
      };
    },
  };
}

export type TuturuuuQaClient = ReturnType<typeof tuturuuuQaClient>;
