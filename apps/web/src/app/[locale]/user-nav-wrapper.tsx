import { Suspense } from 'react';
import type { NavLink } from '@/components/navigation';
import { UserNav } from './user-nav';

export function UserNavWrapper({
  hideMetadata = false,
  renderSettingsDialog = true,
  navLinks = [],
}: {
  hideMetadata?: boolean;
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
        renderSettingsDialog={renderSettingsDialog}
        navLinks={navLinks}
      />
    </Suspense>
  );
}
