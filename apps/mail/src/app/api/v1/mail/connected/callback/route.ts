import {
  createAppSessionUser,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { MAIL_APP_SESSION_AUTH } from '@/lib/mail/auth';
import { ConnectedMailError } from '@/lib/mail/connected/config';
import { finishOAuth } from '@/lib/mail/connected/oauth';

export async function GET(request: NextRequest) {
  await connection();
  const supabase = await createClient(request);
  let { user } = await resolveAuthenticatedSessionUser(supabase);
  if (!user) {
    const auth = verifyAppSessionRequest(request, MAIL_APP_SESSION_AUTH);
    if (auth.ok) user = createAppSessionUser(auth.claims);
  }
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return await finishOAuth(request, user.id);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ConnectedMailError
            ? error.message
            : 'Mail authorization failed',
      },
      { status: error instanceof ConnectedMailError ? error.status : 500 }
    );
  }
}
