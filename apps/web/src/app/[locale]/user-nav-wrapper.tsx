import { Suspense } from 'react';
import { UserNav } from './user-nav';

export function UserNavWrapper({
  hideMetadata = false,
  renderSettingsDialog = true,
}: {
  hideMetadata?: boolean;
  renderSettingsDialog?: boolean;
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
      />
    </Suspense>
  );
}
