import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import ExecutionStatistics from './executions';
import JobsStatistics from './jobs';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceHomePage({ params }: Props) {
  const { wsId } = await params;
  const t = await getTranslations();

  return (
    <>
      <FeatureSummary
        pluralTitle={t('sidebar_tabs.cron')}
        singularTitle={t('sidebar_tabs.cron')}
        description={t('ws-cron.description')}
      />
      <Separator className="my-4" />
      <div className="grid items-end gap-4 md:grid-cols-2">
        <Suspense fallback={<LoadingStatisticCard />}>
          <JobsStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <ExecutionStatistics wsId={wsId} />
        </Suspense>
      </div>
    </>
  );
}
