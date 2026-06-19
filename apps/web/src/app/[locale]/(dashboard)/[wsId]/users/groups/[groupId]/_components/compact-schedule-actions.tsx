'use client';

import { CalendarPlus } from '@tuturuuu/icons';
import type {
  CreateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupScheduleGroup,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { QuickWeeklyScheduleDialog } from '../../_components/quick-weekly-schedule-dialog';

interface CompactScheduleActionsProps {
  canUpdateUserGroups: boolean;
  createPending: boolean;
  fullScheduleHref: string;
  groupId: string;
  groups: WorkspaceUserGroupScheduleGroup[];
  onCreate: (
    payload: CreateWorkspaceUserGroupSessionPayload
  ) => Promise<void> | void;
}

export function CompactScheduleActions({
  canUpdateUserGroups,
  createPending,
  fullScheduleHref,
  groupId,
  groups,
  onCreate,
}: CompactScheduleActionsProps) {
  const detailsT = useTranslations('ws-user-group-details');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canUpdateUserGroups ? (
        <QuickWeeklyScheduleDialog
          canChooseGroup={false}
          defaultGroupId={groupId}
          groups={groups}
          isPending={createPending}
          onSubmit={(payload) => onCreate({ ...payload, groupId })}
        />
      ) : null}
      <Button asChild variant="outline" size="sm">
        <Link href={fullScheduleHref}>
          <CalendarPlus className="h-4 w-4" />
          {detailsT('modify_schedule')}
        </Link>
      </Button>
    </div>
  );
}
