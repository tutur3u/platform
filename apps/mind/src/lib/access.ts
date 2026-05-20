import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function requireMindUser() {
  const user = getAppSessionUserFromRequest(
    { headers: await headers() },
    { targetApp: 'mind' }
  );

  if (!user?.id) {
    redirect('/login');
  }

  if (!isExactTuturuuuDotComEmail(user.email)) {
    redirect('/not-authorized');
  }

  return user;
}
