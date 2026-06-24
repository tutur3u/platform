'use client';

import type { WorkspaceBasicUserRecord } from '@tuturuuu/internal-api';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import {
  getWorkspaceUserDisplayName,
  getWorkspaceUserInitials,
  getWorkspaceUserSecondaryLabel,
} from './workspace-user-display';

interface LinkedWorkspaceUserChipProps {
  user: WorkspaceBasicUserRecord;
}

export function LinkedWorkspaceUserChip({
  user,
}: LinkedWorkspaceUserChipProps) {
  const label = getWorkspaceUserDisplayName(user);
  const secondary = getWorkspaceUserSecondaryLabel(user);

  return (
    <div className="mt-2 flex items-center gap-2 rounded-md border bg-foreground/5 px-2 py-1.5">
      <Avatar className="h-7 w-7">
        {user.avatar_url ? (
          <AvatarImage alt={label} src={user.avatar_url} />
        ) : null}
        <AvatarFallback className="bg-dynamic-green/10 text-[10px] text-dynamic-green">
          {getWorkspaceUserInitials(user)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium text-xs">{label}</p>
        {secondary ? (
          <p className="truncate text-muted-foreground text-xs">{secondary}</p>
        ) : null}
      </div>
    </div>
  );
}
