import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getTimeTrackingData } from '@/lib/time-tracking-helper';
import { GoalManager } from '../components/goal-manager';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function TimeTrackerGoalsPage({ params }: Props) {
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
        <h1 className="font-bold text-3xl">
          {t('time_tracker_pages.goals.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('time_tracker_pages.goals.description')}
        </p>
      </div>
      <GoalManager
        wsId={workspace.id}
        goals={initialData.goals || []}
        categories={initialData.categories || []}
        timerStats={initialData.stats}
      />
    </div>
  );
}
