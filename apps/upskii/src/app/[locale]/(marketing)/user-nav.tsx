import UserNavClient from './user-nav-client';
import { LOCALE_COOKIE_NAME } from '@/constants/common';

import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspaces } from '@/lib/workspace-helper';
import { cookies as c } from 'next/headers';

export async function UserNav({
  hideMetadata = false,
}: {
  hideMetadata?: boolean;
}) {
  const cookies = await c();
  const user = await getCurrentUser();
  const currentLocale = cookies.get(LOCALE_COOKIE_NAME)?.value;

  const workspaces = await getWorkspaces();
  const wsId = workspaces?.[0]?.id;

  return (
    <UserNavClient
      user={user}
      locale={currentLocale}
      hideMetadata={hideMetadata}
      wsId={wsId}
    />
  );
}
