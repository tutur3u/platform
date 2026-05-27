import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function requireChatUser() {
  const user = getAppSessionUserFromRequest(
    { headers: await headers() },
    { targetApp: 'chat' }
  );

  if (!user?.id) {
    redirect('/login');
  }

  return user;
}
