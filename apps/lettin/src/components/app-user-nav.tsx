import { getSatelliteCurrentUser } from '@tuturuuu/satellite/auth';
import UserNavClient from '@tuturuuu/satellite/user-nav-client';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE_NAME, WEB_APP_URL } from '@/constants/common';
export async function AppUserNav({
  hideMetadata = false,
}: {
  hideMetadata?: boolean;
}) {
  const [cookieStore, user] = await Promise.all([
    cookies(),
    getSatelliteCurrentUser('lettin'),
  ]);
  return (
    <UserNavClient
      user={user}
      locale={cookieStore.get(LOCALE_COOKIE_NAME)?.value}
      hideMetadata={hideMetadata}
      appName="Tulletin"
      ttrUrl={WEB_APP_URL}
    />
  );
}
