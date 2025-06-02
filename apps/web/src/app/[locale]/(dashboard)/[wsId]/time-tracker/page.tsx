import TimeTrackerContent from './time-tracker-content';
import { getWorkspace, verifySecret } from '@/lib/workspace-helper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function TimeTrackerPage({ params }: Props) {
  const t = await getTranslations();
  const { wsId } = await params;

  const workspace = await getWorkspace(wsId);
  const user = await getCurrentUser();

  if (!workspace || !user) notFound();

  // Check if time tracking is enabled
  const timeTrackingEnabled = await verifySecret({
    forceAdmin: true,
    wsId,
    name: 'ENABLE_TASKS',
    value: 'true',
  });

  if (!timeTrackingEnabled) notFound();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {t('sidebar_tabs.time_tracker')}
          </h1>
          <p className="text-muted-foreground">
            Track your time, manage categories, and set productivity goals
          </p>
        </div>
      </div>

      <TimeTrackerContent wsId={wsId} />
    </div>
  );
}
