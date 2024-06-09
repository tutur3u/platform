'use client';

import { useWorkspaces } from '@/hooks/useWorkspaces';
import { Transaction } from '@/types/primitives/Transaction';
import { Wallet } from '@/types/primitives/Wallet';
import { Divider } from '@mantine/core';
import moment from 'moment';
import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';
import useSWR from 'swr';

interface Props {
  wsId?: string;
  transaction: Transaction;
  showAmount?: boolean;
  showDatetime?: boolean;
  showWallet?: boolean;
  disableLink?: boolean;
  redirectToWallets?: boolean;
}

const TransactionCard = ({
  wsId,
  transaction,
  showAmount = false,
  showDatetime = false,
  showWallet = false,
  disableLink = false,
  redirectToWallets = false,
}: Props) => {
  const { ws } = useWorkspaces();

  const { t } = useTranslation('transaction-card');

  const apiPath =
    wsId && showWallet && transaction?.wallet_id
      ? `/api/workspaces/${wsId}/finance/wallets/${transaction?.wallet_id}`
      : null;

  const { data: wallet } = useSWR<Wallet>(apiPath);

  const showExtra = showAmount || showDatetime || showWallet;

  if (!ws) return null;

  return (
    <Link
      href={
        disableLink
          ? '#'
          : `/${ws.id}/finance/transactions/${transaction.id}${
              redirectToWallets ? '?redirectToWallets=true' : ''
            }`
      }
      className="border-border group flex flex-col items-center justify-center rounded-lg border bg-zinc-500/5 text-center transition hover:bg-zinc-500/10 dark:border-zinc-700/80 dark:bg-zinc-800/70 dark:hover:bg-zinc-800"
    >
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-2 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            {transaction.description || t('no-description')}
          </div>
        </div>
      </div>

      {showExtra && (
        <>
          <Divider
            variant="dashed"
            className="border-border w-full dark:border-zinc-700"
          />

          <div className="w-full">
            {showAmount && (
              <div
                className={`m-2 rounded border p-2 font-semibold ${
                  (transaction?.amount || 0) < 0
                    ? 'border-red-500/20 bg-red-500/10 text-red-600 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300'
                    : 'border-green-500/20 bg-green-500/10 text-green-600 dark:border-green-300/20 dark:bg-green-300/10 dark:text-green-300'
                }`}
              >
                {transaction?.amount === 0
                  ? t('free')
                  : Intl.NumberFormat('vi-VN', {
                      style: 'currency',
                      currency: 'VND',
                      signDisplay: 'always',
                    }).format(transaction?.amount || 0)}{' '}
              </div>
            )}

            {showWallet && (
              <div className="m-2 rounded border border-purple-500/20 bg-purple-500/10 p-2 font-semibold text-purple-600 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-300">
                {wallet?.name || t('unnamed-wallet')}
              </div>
            )}

            {showDatetime && (
              <div className="m-2 rounded border border-orange-500/20 bg-orange-500/10 p-2 font-semibold text-orange-600 dark:border-orange-300/20 dark:bg-orange-300/10 dark:text-orange-300">
                {moment(transaction?.taken_at).format('HH:mm | DD/MM/YYYY')}
              </div>
            )}
          </div>
        </>
      )}
    </Link>
  );
};

export default TransactionCard;
