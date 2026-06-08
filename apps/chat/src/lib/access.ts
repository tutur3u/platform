import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { redirect } from 'next/navigation';

export async function requireChatUser() {
  const user = await getSatelliteAppSessionUser('chat');

  if (!user?.id) {
    redirect('/login');
  }

  return user;
}
