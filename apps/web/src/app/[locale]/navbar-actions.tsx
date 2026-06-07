import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import PublicNavbarActions from './public-navbar-actions';

export default async function NavbarActions({
  hideMetadata = false,
  renderCommandLauncher = true,
  renderSettingsDialog = true,
}: {
  hideMetadata?: boolean;
  renderCommandLauncher?: boolean;
  renderSettingsDialog?: boolean;
}) {
  const supabase = await createClient();

  const { user: sbUser } = await resolveAuthenticatedSessionUser(supabase);

  if (sbUser) {
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
                renderCommandLauncher={renderCommandLauncher}
                renderSettingsDialog={renderSettingsDialog}
              />
            </div>
            <NotificationPopover />
          </div>
        </div>
      </div>
    );
  }

  return <PublicNavbarActions />;
}
