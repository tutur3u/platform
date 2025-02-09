import { transactionColumns } from '../../transactions/columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tutur3u/supabase/next/server';
import { Transaction } from '@repo/types/primitives/Transaction';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import 'dayjs/locale/vi';
import { Calendar, CreditCard, DollarSign, Wallet } from 'lucide-react';
import moment from 'moment';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
    walletId: string;
    locale: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
  }>;
}

export default async function WalletDetailsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId, walletId, locale } = await params;
  const { wallet } = await getData(walletId);
  const { data: rawData, count } = await getTransactions(
    walletId,
    await searchParams
  );

  const transactions = rawData.map((d) => ({
    ...d,
    href: `/${wsId}/finance/transactions/${d.id}`,
    ws_id: wsId,
  }));

  if (!wallet) notFound();

  return (
    <div className="flex min-h-full w-full flex-col">
      <FeatureSummary
        pluralTitle={wallet.name || t('ws-wallets.plural')}
        singularTitle={wallet.name || t('ws-wallets.singular')}
        description={wallet.description || t('ws-wallets.description')}
        createTitle={t('ws-wallets.create')}
        createDescription={t('ws-wallets.create_description')}
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
              label={t('wallet-data-table.name')}
              value={wallet.name}
            />
            <DetailItem
              icon={<DollarSign className="h-5 w-5" />}
              label={t('wallet-data-table.balance')}
              value={Intl.NumberFormat(locale, {
                style: 'currency',
                currency: 'VND',
              }).format(wallet.balance || 0)}
            />
            <DetailItem
              icon={<CreditCard className="h-5 w-5" />}
              label={t('wallet-data-table.type')}
              value={t(
                `wallet-data-table.${(wallet.type as 'CREDIT' | 'STANDARD').toLowerCase() as 'credit' | 'standard'}`
              )}
            />
            <DetailItem
              icon={<Calendar className="h-5 w-5" />}
              label={t('wallet-data-table.created_at')}
              value={
                wallet.created_at
                  ? moment(wallet.created_at).format('DD/MM/YYYY, HH:mm:ss')
                  : '-'
              }
            />
          </div>
        </div>

        <div className="grid gap-4">
          <div className="h-full rounded-lg border p-4">
            <div className="grid h-full content-start gap-2">
              <div className="text-lg font-semibold">
                {t('wallet-data-table.description')}
              </div>
              <Separator />
              <p>{wallet.description || t('common.empty')}</p>
            </div>
          </div>
        </div>
      </div>
      <Separator className="my-4" />
      <CustomDataTable
        data={transactions}
        columnGenerator={transactionColumns}
        namespace="transaction-data-table"
        count={count}
        defaultVisibility={{
          id: false,
          wallet: false,
          report_opt_in: false,
          created_at: false,
        }}
      />
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

async function getData(walletId: string) {
  const supabase = await createClient();

  const { data: wallet, error: walletError } = await supabase
    .from('workspace_wallets')
    .select('*')
    .eq('id', walletId)
    .single();

  if (walletError) throw walletError;

  return { wallet };
}

async function getTransactions(
  walletId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('wallet_transactions')
    .select(
      '*, workspace_wallets!inner(name, ws_id), transaction_categories(name)',
      {
        count: 'exact',
      }
    )
    .eq('wallet_id', walletId)
    .order('taken_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('description', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data: rawData, error, count } = await queryBuilder;

  const data = rawData?.map(
    ({ workspace_wallets, transaction_categories, ...rest }) => ({
      ...rest,
      wallet: workspace_wallets?.name,
      category: transaction_categories?.name,
    })
  );
  if (error) throw error;

  return { data, count } as {
    data: Transaction[];
    count: number;
  };
}
