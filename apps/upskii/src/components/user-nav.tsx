import UserNavClient from '../app/[locale]/(dashboard)/_components/user-nav-client';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { cookies as c } from 'next/headers';

export async function UserNav({
  hideMetadata = false,
}: {
  hideMetadata?: boolean;
}) {
  const cookies = await c();
  const user = await getCurrentUser();
  const currentLocale = cookies.get(LOCALE_COOKIE_NAME)?.value;

  return (
    <UserNavClient
      user={user}
      locale={currentLocale}
      hideMetadata={hideMetadata}
    />
  );
}
