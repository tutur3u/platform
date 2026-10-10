import {
  getAppSessionTokenFromRequest,
  getAppSessionUserFromRequest,
} from '@tuturuuu/auth/app-session';
import { resolveSupabaseSessionRequest } from '@tuturuuu/auth/supabase-session-user';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import type { StaffOperationContext } from './staff-operation';

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
    request: Request,
    operation?: StaffOperationContext
  ) => Promise<{ user: { id: string } | null; authError: unknown }>;
  app: (request: Request) => { id: string } | null;
  hasApp: (request: Request) => boolean;
  current: (
    id: string,
    operation?: StaffOperationContext
  ) => Promise<{ user: unknown; error: unknown }>;
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
  return async (
    request: Request,
    operation?: StaffOperationContext
  ): Promise<string> => {
    const check = () => {
      if (request.signal.aborted) throw new StaffReadError(503);
      operation?.check();
    };
    check();
    try {
      const credential = request.headers.get('authorization');
      const bearer = credential?.match(/^Bearer (\S+)$/i)?.[1];
      // Explicit credentials get a cookie-free request, including malformed headers.
      if (credential !== null && !bearer) throw new StaffReadError(401);
      const isolated =
        credential === null
          ? request
          : new Request(request.url, {
              headers: { authorization: `Bearer ${bearer}` },
              signal: operation?.signal ?? request.signal,
            });
      let actor: { id: string } | null;
      if (
        bearer?.startsWith('ttr_app_') ||
        (credential === null && deps.hasApp(request))
      ) {
        check();
        actor = deps.app(isolated);
        check();
      } else {
        check();
        let resolved: Awaited<ReturnType<StaffAuthDependencies['session']>>;
        try {
          resolved = await (operation
            ? deps.session(isolated, operation)
            : deps.session(isolated));
        } catch (error) {
          check();
          throw error;
        }
        check();
        if (resolved.authError)
          throw new StaffReadError(authFailure(resolved.authError));
        actor = resolved.user;
      }
      if (!actor) throw new StaffReadError(401);
      check();
      let current: Awaited<ReturnType<StaffAuthDependencies['current']>>;
      try {
        current = await (operation
          ? deps.current(actor.id, operation)
          : deps.current(actor.id));
      } catch (error) {
        check();
        throw error;
      }
      check();
      if (current.error) throw new StaffReadError(authFailure(current.error));
      if (!current.user) throw new StaffReadError(401);
      const parsed = currentIdentity.safeParse(current.user);
      check();
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
      check();
      return user.id;
    } catch (error) {
      check();
      throw error;
    }
  };
}
export const resolveStaffActor = createStaffActorResolver({
  session: async (request, operation) => {
    const check = () => {
      if (request.signal.aborted) throw new StaffReadError(503);
      operation?.check();
    };
    check();
    try {
      // The shared helper's second argument is a supplied client, never context.
      const result = await resolveSupabaseSessionRequest(request);
      check();
      return result;
    } catch (error) {
      check();
      throw error;
    }
  },
  app: (request) =>
    getAppSessionUserFromRequest(request, { targetApp: 'platform' }),
  hasApp: (request) => getAppSessionTokenFromRequest(request) !== null,
  current: async (id, operation) => {
    operation?.check();
    try {
      const admin = await createAdminClient({ noCookie: true });
      operation?.check();
      const { data, error } = await admin.auth.admin.getUserById(id);
      operation?.check();
      return { user: data.user, error };
    } catch (error) {
      operation?.check();
      throw error;
    }
  },
  now: Date.now,
});
