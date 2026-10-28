import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  type AiTempAuthContext,
  validateAiTempAuthRequest,
} from '@tuturuuu/utils/ai-temp-auth';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
  WorkspaceAuthError,
  WorkspaceNotFoundError,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const WorkspaceIdSchema = z.uuid();

export type AiRouteAuthResult =
  | {
      ok: true;
      messageInsertMode?: 'direct' | 'rpc';
      supabase: TypedSupabaseClient;
      user: SupabaseUser;
      tempAuthContext?: AiTempAuthContext;
    }
  | {
      ok: false;
      response: Response;
    };

export const resolveSupabaseSessionUser = resolveAuthenticatedSessionUser;

export async function authorizeAiWorkspace({
  membershipClient,
  request,
  supabase,
  userId,
  wsId,
}: {
  membershipClient?: TypedSupabaseClient;
  request: Request;
  supabase: TypedSupabaseClient;
  userId: string;
  wsId: string;
}): Promise<{ ok: true; wsId: string } | { ok: false; response: Response }> {
  let normalizedWsId: string;
  try {
    normalizedWsId = await normalizeWorkspaceId(
      wsId,
      supabase,
      request as never
    );
  } catch (error) {
    console.error(
      'Workspace ID normalization failed:',
      error instanceof Error ? error.message : error
    );
    const status =
      error instanceof WorkspaceAuthError
        ? 401
        : error instanceof WorkspaceNotFoundError
          ? 404
          : 500;
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unable to resolve workspace identifier' },
        { status }
      ),
    };
  }

  if (!WorkspaceIdSchema.safeParse(normalizedWsId).success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid workspace identifier' },
        { status: 422 }
      ),
    };
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: normalizedWsId,
    userId,
    supabase: membershipClient ?? supabase,
    requiredType: 'MEMBER',
  });

  if (membership.error === 'membership_lookup_failed') {
    console.error('DB error checking workspace membership');
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

  return { ok: true, wsId: normalizedWsId };
}

export async function resolveAiRouteAuth(
  request: Request
): Promise<AiRouteAuthResult> {
  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const tempAuth = await validateAiTempAuthRequest(request);

  if (tempAuth.status === 'revoked') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (tempAuth.status === 'valid') {
    return {
      ok: true,
      supabase,
      user: tempAuth.context.user as SupabaseUser,
      tempAuthContext: tempAuth.context,
    };
  }

  const { user } = await resolveSupabaseSessionUser(supabase);

  if (!user) {
    return {
      ok: false,
      response: new Response('Unauthorized', { status: 401 }),
    };
  }

  return { ok: true, supabase, user };
}

export async function isInternalTuturuuuAiUser(
  auth: Extract<AiRouteAuthResult, { ok: true }>
) {
  return isVerifiedTuturuuuStaffSession(
    await getVerifiedAuthUser(
      await createAdminClient({ noCookie: true }),
      auth.user.id
    )
  );
}
