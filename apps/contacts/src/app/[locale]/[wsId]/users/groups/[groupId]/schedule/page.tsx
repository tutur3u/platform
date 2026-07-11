import { createClient } from '@tuturuuu/supabase/next/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getContactsWorkspacePermissions } from '@/lib/workspace';
import { UserGroupSessionCalendar } from '../../_components/user-group-session-calendar';
import EditEndDateDialog from './edit-end-date-dialog';

export const metadata: Metadata = {
  title: 'Schedule',
  description: 'Manage Schedule in the Group area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    groupId: string;
  }>;
}

export default async function UserGroupDetailsPage({ params }: Props) {
  await connection();

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, groupId }) => {
        const permissions = await getContactsWorkspacePermissions(wsId);
        if (!permissions) notFound();
        const { containsPermission } = permissions;
        const canUpdateUserGroups = containsPermission('update_user_groups');

        const group = await getData(wsId, groupId);

        return (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <EditEndDateDialog
                wsId={wsId}
                groupId={groupId}
                currentStartDate={group.starting_date}
                currentEndDate={group.ending_date}
              />
            </div>
            <UserGroupSessionCalendar
              wsId={wsId}
              groupId={groupId}
              canUpdateSchedule={canUpdateUserGroups}
              title={group.name ?? undefined}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getData(wsId: string, groupId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_user_groups')
    .select('id, name, starting_date, ending_date')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();

  if (error) throw error;
  if (!data) notFound();

  return data;
}
