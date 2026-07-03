import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { revokeUserAiTempAuthTokens } from '@tuturuuu/utils/ai-temp-auth';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return NextResponse.json({ success: true });
  }

  await revokeUserAiTempAuthTokens(user.id);
  return NextResponse.json({ success: true });
}
