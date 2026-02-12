import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { cookies as c } from 'next/headers';
import type { ComponentType } from 'react';
import { LOCALE_COOKIE_NAME } from '../constants/common';
import type { UserNavClientProps } from './create-user-nav-client';

export function createUserNav(
  UserNavClient: ComponentType<UserNavClientProps>
) {
  return async function UserNav({
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
  };
}
