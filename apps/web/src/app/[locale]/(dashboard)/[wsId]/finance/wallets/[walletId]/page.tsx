import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import 'dayjs/locale/vi';
import { Calendar, CreditCard, DollarSign, Wallet } from 'lucide-react';
import moment from 'moment';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface Props {
  params: {
    wsId: string;
    walletId: string;
    locale: string;
  };
}

export default async function WalletDetailsPage({
  params: { wsId: _, walletId, locale },
}: Props) {
  const t = await getTranslations();
  const { wallet } = await getData(walletId);

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
  const supabase = createClient();

  const { data: wallet, error: walletError } = await supabase
    .from('workspace_wallets')
    .select('*')
    .eq('id', walletId)
    .single();

  if (walletError) throw walletError;

  return { wallet };
}
