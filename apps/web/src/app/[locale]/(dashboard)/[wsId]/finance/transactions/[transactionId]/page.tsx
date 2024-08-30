import { Bill } from './bill';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import 'dayjs/locale/vi';
import { CalendarIcon, DollarSign, Wallet } from 'lucide-react';
import moment from 'moment';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface Props {
  params: {
    wsId: string;
    transactionId: string;
    locale: string;
  };
}

export default async function TransactionDetailsPage({
  params: { wsId, transactionId, locale },
}: Props) {
  const t = await getTranslations();
  const { transaction } = await getData(transactionId);

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
      <div className="grid h-fit gap-4 md:grid-cols-2">
        <div className="grid gap-4">
          <div className="grid h-fit gap-2 rounded-lg border p-4">
            <div className="text-lg font-semibold">
              {t('invoices.basic-info')}
            </div>
            <Separator />
            <DetailItem
              icon={<Wallet className="h-5 w-5" />}
              label={t('transaction-data-table.wallet')}
              value={transaction?.wallet_name}
            />
            <DetailItem
              icon={<DollarSign className="h-5 w-5" />}
              label={t('transaction-data-table.amount')}
              value={Intl.NumberFormat(locale, {
                style: 'currency',
                currency: 'VND',
              }).format(transaction.amount || 0)}
            />
            <DetailItem
              icon={<CalendarIcon className="h-5 w-5" />}
              label={t('transaction-data-table.taken_at')}
              value={
                transaction.created_at
                  ? moment(transaction.created_at).format(
                      'DD/MM/YYYY, HH:mm:ss'
                    )
                  : '-'
              }
            />
          </div>
        </div>

        <div className="grid gap-4">
          <div className="h-full rounded-lg border p-4">
            <div className="grid h-full content-start gap-2">
              <div className="text-lg font-semibold">
                {t('ai_chat.upload_files')}
              </div>
              <Separator />
              <Bill wsId={wsId} transactionId={transactionId} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  if (!value) return undefined;
  return (
    <div className="flex items-center gap-1">
      {icon}
      <span className="font-semibold">{label}:</span> {value}
    </div>
  );
}

async function getData(transactionId: string) {
  const supabase = createClient();

  const { data: transaction, error: transactionError } = await supabase
    .from('wallet_transactions')
    .select(
      '*, ...transaction_categories(category:name), ...workspace_wallets(wallet_name:name)'
    )
    .eq('id', transactionId)
    .single();

  if (transactionError) throw transactionError;

  return { transaction };
}
