import { connection, type NextRequest, NextResponse } from 'next/server';
import { hasVerifiedMailStaffAccess, resolveMailAuth } from '@/lib/mail/auth';
import { ConnectedMailError } from '@/lib/mail/connected/config';
import { finishOAuth } from '@/lib/mail/connected/oauth';

export async function GET(request: NextRequest) {
  await connection();
  const auth = await resolveMailAuth(request);
  if ('response' in auth) return auth.response;
  try {
    if (!(await hasVerifiedMailStaffAccess(auth.user.id)))
      throw new ConnectedMailError(403, 'connected_mail_staff_required');

    return await finishOAuth(request, auth.user.id);
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
