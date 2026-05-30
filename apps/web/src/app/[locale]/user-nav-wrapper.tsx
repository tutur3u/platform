import { Suspense } from 'react';
import type { NavLink } from '@/components/navigation';
import { UserNav } from './user-nav';

export function UserNavWrapper({
  hideMetadata = false,
  renderCommandLauncher = true,
  renderSettingsDialog = true,
  navLinks = [],
}: {
  hideMetadata?: boolean;
  renderCommandLauncher?: boolean;
  renderSettingsDialog?: boolean;
  navLinks?: (NavLink | null)[];
}) {
  return (
    <Suspense
      fallback={
        <div className="h-10 w-10 animate-pulse rounded-lg bg-foreground/5" />
      }
    >
      <UserNav
        hideMetadata={hideMetadata}
        renderCommandLauncher={renderCommandLauncher}
        renderSettingsDialog={renderSettingsDialog}
        navLinks={navLinks}
      />
    </Suspense>
  );
}
