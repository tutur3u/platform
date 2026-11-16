'use client';

import { Loader2, WifiOff } from '@tuturuuu/icons';
import type { GlobalCommandLauncherLabels } from './command-launcher-types';

/** Footer status for remote sources; null when every source is settled. */
export function CommandCenterStatus({
  isOffline,
  isSearching,
  labels,
}: {
  isOffline: boolean;
  isSearching: boolean;
  labels: GlobalCommandLauncherLabels;
}) {
  if (!isOffline && !isSearching) return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5" role="status">
      {isOffline ? (
        <WifiOff className="size-3.5 shrink-0" />
      ) : (
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
      )}
      <span className="truncate">
        {isOffline ? labels.offline : labels.searchingWorkspaces}
      </span>
    </span>
  );
}
