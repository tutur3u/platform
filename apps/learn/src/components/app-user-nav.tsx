import type { TulearnBootstrapResponse } from '@tuturuuu/internal-api';
import UserNavClient from '@tuturuuu/satellite/user-nav-client';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE_NAME, WEB_APP_URL } from '@/constants/common';
import { getLearnRenderProfile } from '@/lib/render-profile';

export async function AppUserNav({
  hideMetadata = false,
  profile,
}: {
  hideMetadata?: boolean;
  profile?: TulearnBootstrapResponse['profile'];
}) {
  const [cookieStore, user] = await Promise.all([
    cookies(),
    profile ?? getLearnRenderProfile(),
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
