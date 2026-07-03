import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Minimal authenticated-session shape mind-core needs. Structurally compatible
 * with the app-side `SessionAuthContext` from `@/lib/api-auth`, so route
 * handlers can pass their resolved auth context directly.
 */
export interface MindAuthContext {
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
}

export async function requireMindAccess({
  context,
  request,
  wsId,
}: {
  context: MindAuthContext;
  request: Request;
  wsId: string;
}): Promise<
  | {
      ok: true;
      normalizedWsId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    }
> {
  let normalizedWsId: string;
  try {
    const nextRequest =
      'nextUrl' in request ? (request as NextRequest) : undefined;
    normalizedWsId = await normalizeWorkspaceId(
      wsId,
      context.supabase,
      nextRequest
    );
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid workspace identifier' },
        { status: 422 }
      ),
    };
  }

  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase: context.supabase,
    userId: context.user.id,
    wsId: normalizedWsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Internal error verifying workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  return { normalizedWsId, ok: true };
}
