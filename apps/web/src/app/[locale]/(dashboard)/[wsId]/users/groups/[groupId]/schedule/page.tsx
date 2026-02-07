import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import EditEndDateDialog from './edit-end-date-dialog';
import RecurringScheduleDialog from './recurring-schedule-dialog';
import ScheduleCalendar from './schedule-calendar';

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
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, groupId, locale }) => {
        const { containsPermission } = await getPermissions({ wsId });
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
              <RecurringScheduleDialog
                wsId={wsId}
                groupId={groupId}
                endingDate={group.ending_date}
              />
            </div>
            <ScheduleCalendar
              locale={locale}
              wsId={wsId}
              groupId={groupId}
              initialSessions={group.sessions || []}
              hideOutsideMonthDays={true}
              canUpdateSchedule={canUpdateUserGroups}
              startingDate={group.starting_date}
              endingDate={group.ending_date}
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
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();

  if (error) throw error;
  if (!data) notFound();

  return data;
}
