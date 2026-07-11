'use client';

import { UserRoundCog, Users } from '@tuturuuu/icons';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';

interface MemberCountCellLabels {
  managers: string;
  members: string;
}

interface MemberCountCellProps {
  group: UserGroup;
  labels: MemberCountCellLabels;
}

export function MemberCountCell({ group, labels }: MemberCountCellProps) {
  const totalCount = group.amount ?? 0;
  const managerCount = group.managers?.length ?? 0;
  const memberCount = Math.max(totalCount - managerCount, 0);

  return (
    <div className="flex min-w-28 items-center gap-2">
      <span
        className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1 font-medium text-sm"
        title={labels.members}
      >
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        {memberCount}
      </span>
      <span
        className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1 font-medium text-sm"
        title={labels.managers}
      >
        <UserRoundCog className="h-3.5 w-3.5 text-dynamic-blue" />
        {managerCount}
      </span>
    </div>
  );
}
