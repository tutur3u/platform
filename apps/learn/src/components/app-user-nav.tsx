import UserNavClient from '@tuturuuu/satellite/user-nav-client';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE_NAME, WEB_APP_URL } from '@/constants/common';
import { getLearnRenderProfile } from '@/lib/render-profile';

export async function AppUserNav({
  hideMetadata = false,
}: {
  hideMetadata?: boolean;
}) {
  const [cookieStore, user] = await Promise.all([
    cookies(),
    getLearnRenderProfile(),
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
