import UserNavClient from './user-nav-client';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import {
  getCurrentUser,
  getUserDefaultWorkspace,
} from '@tuturuuu/utils/user-helper';
import { cookies as c } from 'next/headers';

export async function UserNav({
  hideMetadata = false,
}: {
  hideMetadata?: boolean;
}) {
  const cookies = await c();
  const user = await getCurrentUser();
  const currentLocale = cookies.get(LOCALE_COOKIE_NAME)?.value;

  const defaultWorkspace = await getUserDefaultWorkspace();
  const wsId = defaultWorkspace?.id;

  return (
    <UserNavClient
      user={user}
      locale={currentLocale}
      hideMetadata={hideMetadata}
      wsId={wsId}
    />
  );
}
