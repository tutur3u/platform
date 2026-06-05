import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { redirect } from 'next/navigation';

export async function requireMindUser() {
  const user = await getSatelliteAppSessionUser('mind');

  if (!user?.id) {
    redirect('/login');
  }

  return user;
}
