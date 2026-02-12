import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getTimeTrackingData } from '@/lib/time-tracking-helper';
import TimeTrackerWrapper from '../components/time-tracker-wrapper';
import type { TimeTrackerData } from '../types';

export const metadata: Metadata = {
  title: 'Timer',
  description:
    'Manage Timer in the Time Tracker area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function TimeTrackerPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ workspace, wsId }) => {
        const user = await getCurrentUser();
        if (!user) {
          notFound();
        }

        const rawData = await getTimeTrackingData(wsId, user.id);

        // Transform data to match expected types
        const initialData: TimeTrackerData = {
          ...rawData,
          tasks: rawData.tasks.map((task) => ({
            ...task,
            board_name: task.board_name || undefined,
            list_name: task.list_name || undefined,
            assignees: task.assignees?.map((assignee) => ({
              ...assignee,
              display_name: assignee.display_name || undefined,
              avatar_url: assignee.avatar_url || undefined,
              email: assignee.email || undefined,
            })),
          })),
        };

        return (
          <TimeTrackerWrapper
            wsId={wsId}
            initialData={initialData}
            workspace={workspace}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
