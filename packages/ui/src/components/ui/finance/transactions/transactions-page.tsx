import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import ExportDialogContent from '@tuturuuu/ui/finance/transactions/export-dialog-content';
import { TransactionForm } from '@tuturuuu/ui/finance/transactions/form';
import { TransactionsInfinitePage } from '@tuturuuu/ui/finance/transactions/transactions-infinite-page';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

interface Props {
  wsId: string;
  searchParams: {
    q: string;
    page: string;
    pageSize: string;
    userIds?: string | string[];
    categoryIds?: string | string[];
  };
}

export default async function TransactionsPage({ wsId, searchParams }: Props) {
  const t = await getTranslations();

  const { containsPermission } = await getPermissions({
    wsId,
  });

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-transactions.plural')}
        singularTitle={t('ws-transactions.singular')}
        description={t('ws-transactions.description')}
        createTitle={t('ws-transactions.create')}
        createDescription={t('ws-transactions.create_description')}
        form={<TransactionForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <TransactionsInfinitePage
        wsId={wsId}
        canExport={containsPermission('export_finance_data')}
        exportContent={
          <ExportDialogContent
            wsId={wsId}
            exportType="transactions"
            searchParams={searchParams}
          />
        }
      />
    </>
  );
}
