import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getContactsWorkspacePermissions } from '@/lib/workspace';
import { UserGroupSessionCalendar } from '../_components/user-group-session-calendar';

export const metadata: Metadata = {
  title: 'Group Calendar',
  description: 'Manage all user group sessions in a workspace calendar.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function UserGroupCalendarPage({ params }: Props) {
  await connection();

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const permissions = await getContactsWorkspacePermissions(wsId);
        if (!permissions) notFound();

        const canView =
          permissions.containsPermission('manage_users') ||
          permissions.containsPermission('view_user_groups');
        if (!canView) notFound();

        return (
          <UserGroupSessionCalendar
            canChooseGroup
            canUpdateSchedule={permissions.containsPermission(
              'update_user_groups'
            )}
            wsId={wsId}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
