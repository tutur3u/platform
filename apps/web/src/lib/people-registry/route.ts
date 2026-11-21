import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getBearerAppCoordinationToken } from '@tuturuuu/utils/app-coordination-token';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

// Manager routes for the people registry. Authorization lives in the registry
// definer functions; this adapter supplies the verified actor and maps
// database refusals to HTTP responses without leaking their detail.

const uuid = z.string().uuid();

export type PeopleRegistryContext = {
  actorId: string;
  wsId: string;
  request: NextRequest;
  hasFreshSignIn: () => Promise<boolean>;
  rpc: <T = unknown>(
    fn: string,
    args: Record<string, unknown>
  ) => Promise<PeopleRpcResult<T>>;
};

export type PeopleRpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export function peopleJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

const refusals: Record<string, [number, string]> = {
  '42501': [403, 'forbidden'],
  P0002: [404, 'not_found'],
  '55000': [409, 'subject_unavailable'],
  '22023': [400, 'invalid_request'],
  '23505': [409, 'conflict'],
  '23503': [400, 'invalid_reference'],
  '23514': [400, 'invalid_request'],
  '22P02': [400, 'invalid_request'],
};

// Person IDs are lowercased so every route binds display values identically.
export function parsePersonId(raw: string) {
  const parsed = uuid.safeParse(raw);
  return parsed.success ? parsed.data.toLowerCase() : null;
}

export function parseWorkspaceId(raw: string) {
  if (raw === 'root') return ROOT_WORKSPACE_ID;
  const parsed = uuid.safeParse(raw);
  return parsed.success ? parsed.data.toLowerCase() : null;
}

export function withPeopleRegistry<P extends { wsId: string }>(
  handler: (context: PeopleRegistryContext, params: P) => Promise<NextResponse>
) {
  const authenticated = withSessionAuth<P>(
    async (request, { user, supabase }, params) => {
      const wsId = parseWorkspaceId(params.wsId);
      if (!wsId) return peopleJson({ error: 'not_found' }, 404);
      const rawPersonId = (params as { personId?: unknown }).personId;
      if (rawPersonId !== undefined) {
        const personId =
          typeof rawPersonId === 'string' ? parsePersonId(rawPersonId) : null;
        if (!personId) return peopleJson({ error: 'not_found' }, 404);
        params = { ...params, personId };
      }
      const db = await createAdminClient({ noCookie: true });
      const rpc = async <T>(fn: string, args: Record<string, unknown>) => {
        // Registry RPCs live in the private schema and are executable only
        // by the service role.
        const { data, error } = await (
          db.schema('private') as unknown as {
            rpc: (
              name: string,
              body: Record<string, unknown>
            ) => Promise<{ data: unknown; error: { code?: string } | null }>;
          }
        ).rpc(fn, { p_ws: wsId, p_actor: user.id, ...args });
        if (!error) return { ok: true as const, data: data as T };
        const refusal = refusals[error.code ?? ''];
        if (!refusal)
          console.error('People registry call failed', fn, error.code);
        const [status, code] = refusal ?? [503, 'registry_unavailable'];
        return {
          ok: false as const,
          response: peopleJson({ error: code }, status),
        };
      };
      // App sessions (CLI, Mastermind) never count as a fresh sign-in,
      // whatever claims their client reports.
      const hasFreshSignIn = async () =>
        !getBearerAppCoordinationToken(request) &&
        verifyFreshSignIn(supabase, user.id);
      return handler(
        { actorId: user.id, wsId, request, rpc, hasFreshSignIn },
        params
      );
    },
    {
      allowAppSessionAuth: { targetApp: ['platform', 'mastermind'] },
      preferSupabaseSessionAuth: true,
    }
  );

  return async (request: NextRequest, context: { params: Promise<P> }) => {
    await connection();
    const response = await authenticated(request, context);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };
}

const FRESH_SIGN_IN_SECONDS = 300;

const verifiedClaimsSchema = z.object({
  sub: z.string(),
  amr: z.array(z.object({ method: z.string(), timestamp: z.number().int() })),
});

// A fresh tuturuuu.com sign-in within five minutes, read from the verified
// session JWT. App sessions (CLI, Mastermind) carry no such claim and fail.
export async function verifyFreshSignIn(
  supabase: {
    auth: {
      getClaims: () => Promise<{
        data: { claims: unknown } | null;
        error: unknown;
      }>;
    };
  },
  actorId: string,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = verifiedClaimsSchema.safeParse(data?.claims);
    return (
      !error &&
      claims.success &&
      claims.data.sub === actorId &&
      claims.data.amr.some(
        ({ timestamp }) =>
          timestamp <= nowSeconds &&
          nowSeconds - timestamp <= FRESH_SIGN_IN_SECONDS
      )
    );
  } catch {
    return false;
  }
}

export async function readJson<T>(request: NextRequest, schema: z.ZodType<T>) {
  try {
    const parsed = schema.safeParse(await request.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
