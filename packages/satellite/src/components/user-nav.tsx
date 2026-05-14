import { cookies as c } from 'next/headers';
import { getSatelliteCurrentUser } from '../auth';
import { LOCALE_COOKIE_NAME } from '../constants/common';
import UserNavClient from './user-nav-client';

export async function UserNav({
  hideMetadata = false,
}: {
  hideMetadata?: boolean;
}) {
  const cookies = await c();
  const user = await getSatelliteCurrentUser();
  const currentLocale = cookies.get(LOCALE_COOKIE_NAME)?.value;

  return (
    <UserNavClient
      user={user}
      locale={currentLocale}
      hideMetadata={hideMetadata}
    />
  );
}
