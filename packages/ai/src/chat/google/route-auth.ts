import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  type AiTempAuthContext,
  validateAiTempAuthRequest,
} from '@tuturuuu/utils/ai-temp-auth';
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
