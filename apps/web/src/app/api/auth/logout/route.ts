import { MFA_MOBILE_APPROVAL_COOKIE_NAME } from '@tuturuuu/auth/mfa-mobile-approval';
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

  const response = NextResponse.json({ success: true });
  response.cookies.set(MFA_MOBILE_APPROVAL_COOKIE_NAME, '', {
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}
