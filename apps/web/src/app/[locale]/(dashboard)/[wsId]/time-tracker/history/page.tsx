import { SessionHistory } from '../components/session-history';
import { getTimeTrackingData } from '@/lib/time-tracking-helper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function TimeTrackerHistoryPage({ params }: Props) {
  const t = await getTranslations();
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  if (!workspace) {
    notFound();
  }

  const user = await getCurrentUser();
  if (!user) {
    notFound();
  }

  const initialData = await getTimeTrackingData(workspace.id, user.id);

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          {t('time_tracker_pages.history.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('time_tracker_pages.history.description')}
        </p>
      </div>
      <SessionHistory
        wsId={workspace.id}
        sessions={initialData.recentSessions || []}
        tasks={initialData.tasks || []}
        categories={initialData.categories || []}
      />
    </div>
  );
}
