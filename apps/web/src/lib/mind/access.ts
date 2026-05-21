import 'server-only';

import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { SessionAuthContext } from '@/lib/api-auth';

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
