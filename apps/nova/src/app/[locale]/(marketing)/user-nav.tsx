import {
  getCurrentUserProfile,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { cookies as c, headers } from 'next/headers';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { getNovaAppSessionUserFromHeaders } from '@/lib/app-session';
import UserNavClient from './user-nav-client';

export async function UserNav({
  hideMetadata = false,
}: {
  hideMetadata?: boolean;
}) {
  const cookies = await c();
  const requestHeaders = await headers();
  const appSessionUser = await getNovaAppSessionUserFromHeaders();
  const user = appSessionUser
    ? await getCurrentUserProfile(
        withForwardedInternalApiAuth(requestHeaders)
      ).catch(() => ({
        email: appSessionUser.email,
        id: appSessionUser.id,
      }))
    : null;
  const currentLocale = cookies.get(LOCALE_COOKIE_NAME)?.value;

  return (
    <UserNavClient
      user={user}
      locale={currentLocale}
      hideMetadata={hideMetadata}
    />
  );
}
