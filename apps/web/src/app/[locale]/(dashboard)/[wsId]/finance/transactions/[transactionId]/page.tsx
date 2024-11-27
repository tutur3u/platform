import { Bill } from './bill';
import { TransactionObjectRowActions } from './row-actions';
import { StorageObject } from '@/types/primitives/StorageObject';
import { joinPath } from '@/utils/path-helper';
import { createClient } from '@/utils/supabase/server';
import { Button } from '@repo/ui/components/ui/button';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import 'dayjs/locale/vi';
import { CalendarIcon, DollarSign, FileText, Wallet } from 'lucide-react';
import moment from 'moment';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
    transactionId: string;
    locale: string;
  }>;
}

export default async function TransactionDetailsPage({ params }: Props) {
  const { wsId, transactionId, locale } = await params;
  const t = await getTranslations();
  const { objects, transaction } = await getData(wsId, transactionId);

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
        <div className="space-y-4">
          <div className="grid h-fit gap-2 rounded-lg border p-4">
            <div className="text-lg font-semibold">
              {t('invoices.basic-info')}
            </div>
            <Separator />
            <DetailItem
              icon={<Wallet className="h-5 w-5" />}
              label={t('transaction-data-table.wallet')}
              value={transaction?.wallet_name}
              href={`/${wsId}/finance/wallets/${transaction?.wallet_id}`}
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

          {objects.length > 0 && (
            <div className="h-fit space-y-2 rounded-lg border p-4">
              <div className="flex justify-between text-lg font-semibold">
                {t('invoices.files')}
                <Button variant="ghost" size="xs" asChild>
                  <Link
                    href={`/${joinPath(wsId, 'drive')}?path=${joinPath('finance', 'transactions', transactionId)}`}
                  >
                    {t('sidebar_tabs.drive')}
                  </Link>
                </Button>
              </div>
              <Separator />
              {objects.map((object) => (
                <DetailObject
                  key={object.id}
                  wsId={wsId}
                  transactionId={transactionId}
                  object={object}
                />
              ))}
            </div>
          )}
        </div>

        <div className="grid h-fit gap-4">
          <div className="h-full rounded-lg border p-4">
            <div className="grid h-full content-start gap-2">
              <div className="text-lg font-semibold">
                {t('ai_chat.upload_files')}
              </div>
              <Separator className="mb-2" />
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
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  href?: string;
}) {
  if (!value) return undefined;
  if (href)
    return (
      <Link href={href} className="flex items-center gap-1 hover:underline">
        {icon}
        <span className="font-semibold">{label}:</span> {value}
      </Link>
    );

  return (
    <div className="flex items-center gap-1">
      {icon}
      <span className="font-semibold">{label}:</span> {value}
    </div>
  );
}

function DetailObject({
  wsId,
  transactionId,
  object,
}: {
  wsId: string;
  transactionId: string;
  object: StorageObject;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <FileText className="h-4 w-4 flex-shrink-0" />

      <span className="flex-1 truncate">{object.name}</span>

      <div className="flex-shrink-0">
        <TransactionObjectRowActions
          wsId={wsId}
          transactionId={transactionId}
          storageObj={object}
        />
      </div>
    </div>
  );
}

async function getData(wsId: string, transactionId: string) {
  const supabase = await createClient();

  const { data: transaction, error: transactionError } = await supabase
    .from('wallet_transactions')
    .select(
      '*, ...transaction_categories(category:name), ...workspace_wallets(wallet_name:name)'
    )
    .eq('id', transactionId)
    .single();

  if (transactionError) throw transactionError;

  const { data: objects, error: objectError } = await supabase.storage
    .from('workspaces')
    .list(joinPath(wsId, 'finance/transactions', transactionId));

  if (objectError) throw objectError;

  return { objects, transaction };
}
