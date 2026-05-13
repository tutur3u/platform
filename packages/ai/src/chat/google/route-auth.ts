import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  type AiTempAuthContext,
  validateAiTempAuthRequest,
} from '@tuturuuu/utils/ai-temp-auth';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { NextResponse } from 'next/server';

export type AiRouteAuthResult =
  | {
      ok: true;
      supabase: TypedSupabaseClient;
      user: SupabaseUser;
      tempAuthContext?: AiTempAuthContext;
    }
  | {
      ok: false;
      response: Response;
    };

export const resolveSupabaseSessionUser = resolveAuthenticatedSessionUser;

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
  const tempEmail =
    typeof auth.tempAuthContext?.user?.email === 'string'
      ? auth.tempAuthContext.user.email
      : null;
  const sessionEmail =
    typeof auth.user.email === 'string' ? auth.user.email : null;

  if (isExactTuturuuuDotComEmail(tempEmail ?? sessionEmail)) {
    return true;
  }

  const { data } = await auth.supabase
    .from('user_private_details')
    .select('email')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  return isExactTuturuuuDotComEmail(data?.email);
}
