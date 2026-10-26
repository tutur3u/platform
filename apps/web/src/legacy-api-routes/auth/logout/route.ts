import { MFA_MOBILE_APPROVAL_COOKIE_NAME } from '@tuturuuu/auth/mfa-mobile-approval';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { revokeSignOutCredentials } from '@/lib/auth/sign-out-credentials';

export async function POST() {
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  // Revoke while the session still authorizes the RPC. Never throws, so
  // sign-out always runs.
  if (user) await revokeSignOutCredentials(user.id, supabase);

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
