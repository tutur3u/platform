import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { cookies as c } from 'next/headers';
import type { NavLink } from '@/components/navigation';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import UserNavClient from './user-nav-client';

export async function UserNav({
  hideMetadata = false,
  workspace,
  renderCommandLauncher = true,
  renderSettingsDialog = true,
  navLinks = [],
  user: providedUser,
}: {
  hideMetadata?: boolean;
  workspace?: Workspace | null;
  renderCommandLauncher?: boolean;
  renderSettingsDialog?: boolean;
  navLinks?: (NavLink | null)[];
  user?: WorkspaceUser | null;
}) {
  const cookies = await c();
  const user =
    providedUser === undefined
      ? await import('@tuturuuu/utils/user-helper').then(({ getCurrentUser }) =>
          getCurrentUser()
        )
      : providedUser;
  const currentLocale = cookies.get(LOCALE_COOKIE_NAME)?.value;

  return (
    <UserNavClient
      user={user}
      locale={currentLocale}
      hideMetadata={hideMetadata}
      workspace={workspace}
      renderCommandLauncher={renderCommandLauncher}
      renderSettingsDialog={renderSettingsDialog}
      navLinks={navLinks}
    />
  );
}
