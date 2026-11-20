import { getSatelliteCurrentUser } from '@tuturuuu/satellite/auth';
import UserNavClient from '@tuturuuu/satellite/user-nav-client';
import {
  createRequestLocal,
  maybeBridgeRequest,
} from '@tuturuuu/start-bridge/request-context/reader';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE_NAME, WEB_APP_URL } from '@/constants/common';

const navigationUser = createRequestLocal<
  ReturnType<typeof getSatelliteCurrentUser>
>('Learn navigation user');

function getNavigationUser() {
  if (!maybeBridgeRequest()) return getSatelliteCurrentUser('learn');

  const existing = navigationUser.get();
  if (existing) return existing;
  const user = getSatelliteCurrentUser('learn');
  navigationUser.set(user);
  return user;
}

export async function AppUserNav({
  hideMetadata = false,
}: {
  hideMetadata?: boolean;
}) {
  const [cookieStore, user] = await Promise.all([
    cookies(),
    getNavigationUser(),
  ]);

  return (
    <UserNavClient
      appName="Learn"
      hideMetadata={hideMetadata}
      locale={cookieStore.get(LOCALE_COOKIE_NAME)?.value}
      ttrUrl={WEB_APP_URL}
      user={user}
    />
  );
}
