'use client';

import { Bill } from './bill';
import SettingItemCard from '@/components/settings/SettingItemCard';
import { Category } from '@/types/primitives/Category';
import { Transaction } from '@/types/primitives/Transaction';
import { Wallet } from '@/types/primitives/Wallet';
import { fetcher } from '@/utils/fetcher';
import { Button } from '@repo/ui/components/ui/button';
import { Separator } from '@repo/ui/components/ui/separator';
import { cn } from '@repo/ui/lib/utils';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import 'dayjs/locale/vi';
import { CalendarIcon } from 'lucide-react';
import { useLocale } from 'next-intl';
import useSWR from 'swr';

interface Props {
  params: {
    wsId: string;
    transactionId: string;
  };
}
export default function TransactionDetailsPage({
  params: { wsId, transactionId },
}: Props) {
  const locale = useLocale();
  const t = (key: string) => key;

  const apiPath =
    wsId && transactionId
      ? `/api/workspaces/${wsId}/transactions/${transactionId}`
      : null;

  const { data: transaction } = useSWR<Transaction>(apiPath, fetcher);

  const walletApiPath =
    wsId && transaction?.wallet_id
      ? `/api/workspaces/${wsId}/wallets/${transaction?.wallet_id}`
      : null;

  const { data: transactionWallet } = useSWR<Wallet>(walletApiPath, fetcher);

  const categoryApiPath =
    wsId && transaction?.category_id
      ? `/api/workspaces/${wsId}/categories/${transaction?.category_id}`
      : null;

  const { data: transactionCategory } = useSWR<Category>(
    categoryApiPath,
    fetcher
  );

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="my-2">
        <div className="text-2xl font-semibold">{t('transaction-details')}</div>
        <Separator className="my-2" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <SettingItemCard
          className="col-span-2 sm:col-span-1"
          title={t('wallets')}
          description={t('wallet-description')}
          disabled={!transactionWallet}
        >
          <p className="text-foreground/80 text-2xl">
            {transactionWallet?.name}
          </p>
        </SettingItemCard>

        <SettingItemCard
          className="col-span-2 sm:col-span-1"
          title={t('categories')}
          description={t('categories-description')}
          disabled={!transactionWallet}
        >
          <div className="grid gap-2">
            <p className="text-foreground/80 text-2xl">
              {transactionCategory?.name}
            </p>
          </div>
        </SettingItemCard>

        <SettingItemCard
          className="col-span-2"
          title={t('amount')}
          description={t('amount-description')}
          disabled={!transactionWallet}
        >
          <div className="grid gap-2">
            <p className="text-foreground/80 text-center text-3xl font-semibold">
              {transaction?.amount &&
                Intl.NumberFormat('vi-VN', {
                  style: 'currency',
                  currency: 'VND',
                }).format(transaction?.amount as number)}
            </p>
          </div>
        </SettingItemCard>

        <SettingItemCard
          className="col-span-2"
          title={t('description')}
          description={t('description-description')}
          disabled={!transactionWallet}
        >
          <p className="text-foreground/80 text-xl">
            {transaction?.description}
          </p>
        </SettingItemCard>

        <SettingItemCard
          className="col-span-2"
          title={t('taken_at')}
          description={t('taken_at-description')}
          disabled={!transactionWallet}
        >
          <Button
            variant={'outline'}
            className={cn(
              'pl-3 text-left font-normal',
              !transaction?.created_at && 'text-muted-foreground'
            )}
          >
            {transaction?.created_at ? (
              format(
                transaction?.created_at,
                locale === 'vi' ? 'dd/MM/yyyy, ppp' : 'PPP',
                {
                  locale: locale === 'vi' ? vi : enUS,
                }
              )
            ) : (
              <span>{t('transaction-data-table.taken_at')}</span>
            )}
            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        </SettingItemCard>
        <SettingItemCard
          className="col-span-2"
          title={t('bills')}
          description={t('bill-description')}
          disabled={!transactionWallet}
        >
          <Bill wsId={wsId} transactionId={transactionId} />
        </SettingItemCard>
      </div>
    </div>
  );
}
