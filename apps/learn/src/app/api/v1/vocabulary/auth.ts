import { verifyAppSessionRequest } from '@tuturuuu/auth/app-session';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';

export async function hasLearnSession(request: NextRequest) {
  const appSessionVerification = verifyAppSessionRequest(request, {
    targetApp: 'learn',
  });

  if (appSessionVerification.ok) return true;

  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return !error && Boolean(user);
}
