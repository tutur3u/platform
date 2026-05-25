import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import { getTransaction } from '@tuturuuu/internal-api/finance';
import type { TransactionTag } from '@tuturuuu/types/primitives/Transaction';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import 'dayjs/locale/vi';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { TransactionDetailsClientPage } from './transaction-details-client-page';

interface Props {
  params: Promise<{
    wsId: string;
    transactionId: string;
    locale: string;
  }>;
  internalApiOptions?: InternalApiClientOptions;
}

type TransactionDetailsData = {
  category?: string | null;
  description?: string | null;
  tags?: TransactionTag[];
} & Record<string, unknown>;

export default async function TransactionDetailsPage({
  params,
  internalApiOptions,
}: Props) {
  const { wsId, transactionId } = await params;

  const t = await getTranslations();
  const { transaction, tags } = await getData(
    wsId,
    transactionId,
    internalApiOptions
  );

  if (!transaction) notFound();

  return (
    <div className="flex min-h-full w-full flex-col">
      <FeatureSummary
        pluralTitle={transaction.category || t('ws-transactions.plural')}
        singularTitle={transaction.category || t('ws-transactions.singular')}
        description={
          transaction.description || t('ws-transactions.description')
        }
        createTitle={t('ws-transactions.create')}
        createDescription={t('ws-transactions.create_description')}
      />
      <Separator className="my-4" />

      <TransactionDetailsClientPage
        wsId={wsId}
        transaction={transaction}
        tags={tags}
      />
    </div>
  );
}

async function getData(
  wsId: string,
  transactionId: string,
  internalApiOptions?: InternalApiClientOptions
) {
  const transaction = (await getTransaction(
    wsId,
    transactionId,
    internalApiOptions
  )) as TransactionDetailsData;
  const tags = transaction?.tags ?? [];

  return { transaction, tags };
}
