import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
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
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

  try {
    const workspace = await getWorkspace(wsId);
    const user = await getCurrentUser();

    if (!workspace || !user) notFound();

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

    return <TimeTrackerWrapper wsId={wsId} initialData={initialData} />;
  } catch (error) {
    console.error('Error loading time tracker:', error);
    notFound();
  }
}
