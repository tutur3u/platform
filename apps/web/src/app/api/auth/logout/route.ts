import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { revokeUserAiTempAuthTokens } from '@tuturuuu/utils/ai-temp-auth';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (user) {
    await revokeUserAiTempAuthTokens(user.id);
  }

  const { error } = await supabase.auth.signOut({
    scope: 'local',
  });

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ success: true });
}
