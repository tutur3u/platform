import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';

async function hasAuthenticatedSessionUser() {
  const [{ resolveAuthenticatedSessionUser }, { createClient }] =
    await Promise.all([
      import('@tuturuuu/supabase/next/auth-session-user'),
      import('@tuturuuu/supabase/next/server'),
    ]);
  const supabase = await createClient();

  const { user } = await resolveAuthenticatedSessionUser(supabase);

  return Boolean(user);
}

export default async function NavbarActions({
  hideMetadata = false,
  renderCommandLauncher = true,
  renderSettingsDialog = true,
  user: providedUser,
  workspace,
}: {
  hideMetadata?: boolean;
  renderCommandLauncher?: boolean;
  renderSettingsDialog?: boolean;
  user?: WorkspaceUser | null;
  workspace?: Workspace | null;
}) {
  const hasUser =
    providedUser === undefined
      ? await hasAuthenticatedSessionUser()
      : Boolean(providedUser);

  if (hasUser) {
    const [{ UserNavWrapper }, { default: NotificationPopover }] =
      await Promise.all([
        import('./user-nav-wrapper'),
        import('./notification-popover'),
      ]);

    return (
      <div className="relative flex w-full">
        <div className="flex w-full flex-col gap-2">
          <div className="flex w-full items-center gap-1">
            <div className="flex-1">
              <UserNavWrapper
                hideMetadata={hideMetadata}
                user={providedUser}
                renderCommandLauncher={renderCommandLauncher}
                renderSettingsDialog={renderSettingsDialog}
                workspace={workspace}
              />
            </div>
            <NotificationPopover />
          </div>
        </div>
      </div>
    );
  }

  const { default: PublicNavbarActions } = await import(
    './public-navbar-actions'
  );

  return <PublicNavbarActions />;
}
