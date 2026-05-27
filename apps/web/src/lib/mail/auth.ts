import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import type { MailRouteContext } from './types';

export const MAIL_APP_SESSION_AUTH = {
  targetApp: ['mail', 'platform'],
} as const;

export async function resolveMailRouteContext(
  request: NextRequest,
  wsId: string
): Promise<
  | {
      ok: true;
      context: MailRouteContext;
    }
  | {
      ok: false;
      response: NextResponse;
    }
> {
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: MAIL_APP_SESSION_AUTH,
  });

  if (!auth.ok) {
    return { ok: false, response: auth.response };
  }

  if (!isExactTuturuuuDotComEmail(auth.user.email)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Mail is available only to exact @tuturuuu.com accounts.',
        },
        { status: 403 }
      ),
    };
  }

  const normalizedWsId = await normalizeWorkspaceId(
    wsId,
    auth.supabase,
    request
  );
  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'ANY',
    supabase: auth.supabase,
    userId: auth.user.id,
    wsId: normalizedWsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    context: {
      normalizedWsId,
      supabase: auth.supabase,
      user: {
        email: auth.user.email,
        id: auth.user.id,
      },
    },
  };
}
