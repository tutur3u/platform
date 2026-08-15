'use client';

import { CalendarDays } from '@tuturuuu/icons';
import type {
  CreateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupScheduleGroup,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ScheduleSetupDialog } from '../../_components/schedule-setup-dialog';

interface CompactScheduleActionsProps {
  canUpdateUserGroups: boolean;
  createPending: boolean;
  fullScheduleHref: string;
  groupId: string;
  groups: WorkspaceUserGroupScheduleGroup[];
  onCreate: (
    payload: CreateWorkspaceUserGroupSessionPayload
  ) => Promise<void> | void;
  wsId: string;
}

export function CompactScheduleActions({
  canUpdateUserGroups,
  createPending,
  fullScheduleHref,
  groupId,
  groups,
  onCreate,
  wsId,
}: CompactScheduleActionsProps) {
  const detailsT = useTranslations('ws-user-group-details');
  const scheduleT = useTranslations('ws-user-group-schedule');

  return (
    <div
      className={cn(
        'grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center',
        canUpdateUserGroups ? 'grid-cols-2' : 'grid-cols-1'
      )}
    >
      {canUpdateUserGroups ? (
        <ScheduleSetupDialog
          canChooseGroup={false}
          defaultGroupId={groupId}
          groups={groups}
          isPending={createPending}
          onCreate={(payload) => onCreate({ ...payload, groupId })}
          wsId={wsId}
        />
      ) : null}
      <Button asChild className="w-full sm:w-auto" variant="outline" size="sm">
        <Link href={fullScheduleHref}>
          <CalendarDays className="h-4 w-4" />
          <span className="sm:hidden">{scheduleT('calendar_title')}</span>
          <span className="hidden sm:inline">
            {detailsT('modify_schedule')}
          </span>
        </Link>
      </Button>
    </div>
  );
}
