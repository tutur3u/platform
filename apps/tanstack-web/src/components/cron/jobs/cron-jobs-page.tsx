'use client';

import type { ListWorkspaceCronJobsResponse } from '@tuturuuu/internal-api';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import { getCronJobsColumns } from './columns';

type CronJobsPageProps = {
  jobs: ListWorkspaceCronJobsResponse;
  locale: string;
};

export function CronJobsPage({ jobs, locale }: CronJobsPageProps) {
  const t = useTranslations();

  return (
    <>
      <FeatureSummary
        description={t('ws-cron-jobs.description')}
        pluralTitle={t('ws-cron-jobs.plural')}
        singularTitle={t('ws-cron-jobs.singular')}
      />
      <Separator className="my-4" />
      <CustomDataTable
        columnGenerator={getCronJobsColumns}
        count={jobs.count}
        data={jobs.data}
        defaultVisibility={{
          created_at: false,
          id: false,
        }}
        extraData={{ locale }}
        namespace="cron-job-data-table"
        pageIndex={Math.max(jobs.page - 1, 0)}
        pageSize={jobs.pageSize}
      />
    </>
  );
}
