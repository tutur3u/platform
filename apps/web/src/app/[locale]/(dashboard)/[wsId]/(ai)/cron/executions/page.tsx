import { Executions } from './executions';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';

// interface Props {
//   params: Promise<{
//     wsId: string;
//   }>;
// }

export default async function WorkspaceHomePage() {
  const t = await getTranslations();

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-cron-executions.plural')}
        singularTitle={t('ws-cron-executions.singular')}
        description={t('ws-cron-executions.description')}
      />
      <Separator className="my-4" />
      {/* <CustomDataTable
        data={datasets}
        namespace="user-data-table"
        columnGenerator={getColumns}
        extraData={{ locale, wsId }}
        count={count}
        defaultVisibility={{
          id: false,
        }}
      /> */}

      <Executions />
    </>
  );
}
