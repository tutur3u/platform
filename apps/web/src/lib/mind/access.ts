import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { SessionAuthContext } from '@/lib/api-auth';

async function resolveInternalEmail({ supabase, user }: SessionAuthContext) {
  if (isExactTuturuuuDotComEmail(user.email)) {
    return user.email ?? null;
  }

  const { data } = await (supabase as TypedSupabaseClient)
    .from('user_private_details')
    .select('email')
    .eq('user_id', user.id)
    .maybeSingle();

  return typeof data?.email === 'string' ? data.email : null;
}

export async function requireMindAccess({
  context,
  request,
  wsId,
}: {
  context: SessionAuthContext;
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
  const email = await resolveInternalEmail(context);

  if (!isExactTuturuuuDotComEmail(email)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Mind is limited to @tuturuuu.com accounts' },
        { status: 403 }
      ),
    };
  }

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
