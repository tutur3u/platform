import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, type NextRequest, NextResponse } from 'next/server';
import type { z } from 'zod';
import {
  admitSignedRequest,
  type PeopleAdmission,
  type PeoplePrincipal,
  type PeoplePrincipalKind,
  type PeoplePrincipalRpc,
} from './request-signature';

// Adapter for machine-principal registry routes under /api/v1/people. It
// reads the exact body bytes, verifies the principal signature and admits the
// request before any handler runs. Responses never explain a refusal beyond
// its code.

const MAX_BODY_BYTES = 64 * 1024;

export type PeopleMachineContext = {
  request: NextRequest;
  principal: PeoplePrincipal;
  body: Uint8Array;
  rpc: PeoplePrincipalRpc;
};

export function machineJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

const refusalStatus: Record<
  Exclude<PeopleAdmission, { ok: true }>['reason'],
  number
> = {
  unsigned: 401,
  signature_refused: 401,
  stale_request: 401,
  nonce_replayed: 401,
  principal_refused: 403,
  rate_limited: 429,
  registry_unavailable: 503,
};

// Parses the exact signed body bytes; an empty body is an empty object.
export function parseMachineBody<T>(bytes: Uint8Array, schema: z.ZodType<T>) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed = schema.safeParse(text ? JSON.parse(text) : {});
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function readBody(request: NextRequest) {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return null;
  const body = new Uint8Array(await request.arrayBuffer());
  return body.byteLength > MAX_BODY_BYTES ? null : body;
}

export function withPeopleMachine(
  kinds: readonly PeoplePrincipalKind[],
  handler: (context: PeopleMachineContext) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    await connection();
    const body = await readBody(request);
    if (!body) return machineJson({ error: 'payload_too_large' }, 413);
    const db = await createAdminClient({ noCookie: true });
    // Registry RPCs live in the private schema and are executable only by
    // the service role.
    const rpc: PeoplePrincipalRpc = async (fn, args) => {
      const { data, error } = await (
        db.schema('private') as unknown as {
          rpc: (
            name: string,
            body: Record<string, unknown>
          ) => Promise<{ data: unknown; error: { code?: string } | null }>;
        }
      ).rpc(fn, args);
      if (error) console.error('People registry call failed', fn, error.code);
      return { data, error };
    };
    const admission = await admitSignedRequest({
      headers: request.headers,
      method: request.method,
      path: `${request.nextUrl.pathname}${request.nextUrl.search}`,
      body,
      kinds,
      rpc,
    });
    if (!admission.ok)
      return machineJson(
        { error: admission.reason },
        refusalStatus[admission.reason]
      );
    return handler({ request, principal: admission.principal, body, rpc });
  };
}
