import {
  getAppSessionTokenFromRequest,
  getAppSessionUserFromRequest,
} from '@tuturuuu/auth/app-session';
import { resolveSupabaseSessionRequest } from '@tuturuuu/auth/supabase-session-user';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';

export class StaffReadError extends Error {
  constructor(public readonly status: 401 | 403 | 503) {
    super('feedback_staff_access_failed');
  }
}
const currentIdentity = z.object({
  id: z.uuid(),
  email: z.string().nullable().optional(),
  email_confirmed_at: z.string().nullable().optional(),
  banned_until: z.string().nullable().optional(),
  app_metadata: z
    .object({ employee_onboarding: z.unknown().optional() })
    .optional(),
});
export interface StaffAuthDependencies {
  session: (
    request: Request
  ) => Promise<{ user: { id: string } | null; authError: unknown }>;
  app: (request: Request) => { id: string } | null;
  hasApp: (request: Request) => boolean;
  current: (id: string) => Promise<{ user: unknown; error: unknown }>;
  now: () => number;
}
function authFailure(error: unknown): 401 | 503 {
  const parsed = z
    .object({ status: z.number().optional(), code: z.string().optional() })
    .safeParse(error);
  return parsed.success &&
    (parsed.data.status === 401 ||
      parsed.data.status === 403 ||
      parsed.data.status === 404 ||
      [
        'session_not_found',
        'user_not_found',
        'bad_jwt',
        'refresh_token_not_found',
      ].includes(parsed.data.code ?? ''))
    ? 401
    : 503;
}
export function createStaffActorResolver(deps: StaffAuthDependencies) {
  return async (request: Request): Promise<string> => {
    const credential = request.headers.get('authorization');
    const bearer = credential?.match(/^Bearer (\S+)$/i)?.[1];
    // Explicit credentials get a cookie-free request, including malformed headers.
    if (credential !== null && !bearer) throw new StaffReadError(401);
    const isolated =
      credential === null
        ? request
        : new Request(request.url, {
            headers: { authorization: `Bearer ${bearer}` },
          });
    let actor: { id: string } | null;
    if (
      bearer?.startsWith('ttr_app_') ||
      (credential === null && deps.hasApp(request))
    ) {
      actor = deps.app(isolated);
    } else {
      const resolved = await deps.session(isolated);
      if (resolved.authError)
        throw new StaffReadError(authFailure(resolved.authError));
      actor = resolved.user;
    }
    if (!actor) throw new StaffReadError(401);
    const current = await deps.current(actor.id);
    if (current.error) throw new StaffReadError(authFailure(current.error));
    if (!current.user) throw new StaffReadError(401);
    const parsed = currentIdentity.safeParse(current.user);
    if (!parsed.success) throw new StaffReadError(503);
    const user = parsed.data;
    if (user.id !== actor.id) throw new StaffReadError(401);
    const ban =
      user.banned_until == null ? null : Date.parse(user.banned_until);
    if (
      !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@tuturuuu\.com$/i.test(
        user.email ?? ''
      ) ||
      !user.email_confirmed_at ||
      !Number.isFinite(Date.parse(user.email_confirmed_at)) ||
      (ban !== null && (!Number.isFinite(ban) || ban > deps.now())) ||
      user.app_metadata?.employee_onboarding !== true
    )
      throw new StaffReadError(403);
    // Canonical registry tuple is checked in the final SQL operation, never cached here.
    return user.id;
  };
}
export const resolveStaffActor = createStaffActorResolver({
  session: resolveSupabaseSessionRequest,
  app: (request) =>
    getAppSessionUserFromRequest(request, { targetApp: 'platform' }),
  hasApp: (request) => getAppSessionTokenFromRequest(request) !== null,
  current: async (id) => {
    const admin = await createAdminClient({ noCookie: true });
    const { data, error } = await admin.auth.admin.getUserById(id);
    return { user: data.user, error };
  },
  now: Date.now,
});
