import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Suspense } from 'react';
import type { NavLink } from '@/components/navigation';
import { UserNav } from './user-nav';

export function UserNavWrapper({
  hideMetadata = false,
  renderCommandLauncher = true,
  renderSettingsDialog = true,
  navLinks = [],
  user,
  workspace,
}: {
  hideMetadata?: boolean;
  renderCommandLauncher?: boolean;
  renderSettingsDialog?: boolean;
  navLinks?: (NavLink | null)[];
  user?: WorkspaceUser | null;
  workspace?: Workspace | null;
}) {
  return (
    <Suspense
      fallback={
        <div className="h-10 w-10 animate-pulse rounded-lg bg-foreground/5" />
      }
    >
      <UserNav
        hideMetadata={hideMetadata}
        user={user}
        renderCommandLauncher={renderCommandLauncher}
        renderSettingsDialog={renderSettingsDialog}
        navLinks={navLinks}
        workspace={workspace}
      />
    </Suspense>
  );
}
