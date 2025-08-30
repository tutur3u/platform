import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTimeTrackingData } from '@/lib/time-tracking-helper';
import TimeTrackerHeader from './components/time-tracker-header';
import type { TimeTrackerData } from './types';

interface TimeTrackerLayoutProps {
  children: React.ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}

export default async function TimeTrackerLayout({
  children,
  params,
}: TimeTrackerLayoutProps) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

  try {
    const workspace = await getWorkspace(wsId);
    const user = await getCurrentUser();

    if (!workspace || !user) notFound();

    const rawData = await getTimeTrackingData(wsId, user.id);
    const initialData: TimeTrackerData = { ...rawData };

    return (
      <div className="space-y-6">
        <TimeTrackerHeader wsId={wsId} initialData={initialData} />

        {children}
      </div>
    );
  } catch (error) {
    console.error('Error loading time tracker data:', error);
    notFound();
  }
}
