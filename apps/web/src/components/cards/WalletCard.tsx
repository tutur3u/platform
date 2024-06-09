'use client';

import { Wallet } from '@/types/primitives/Wallet';
import { Divider } from '@mantine/core';
import Link from 'next/link';

interface Props {
  wallet: Wallet;
  amount?: number;
  disableLink?: boolean;
  showBalance?: boolean;
  showAmount?: boolean;
}

const WalletCard = ({
  wallet,
  disableLink = false,
  showBalance = false,
  showAmount = false,
}: Props) => {
  // const countApi =
  //   showAmount && ws?.id && wallet?.id && amount === undefined
  //     ? `/api/workspaces/${ws.id}/finance/wallets/${wallet.id}/transactions/count`
  //     : null;

  // const { data: count } = useSWR<number>(countApi);

  return (
    <Link
      href={disableLink ? '#' : `/`}
      // href={disableLink ? '#' : `/${ws.id}/finance/wallets/${wallet.id}`}
      className="border-border group flex flex-col items-center justify-center rounded-lg border bg-zinc-500/5 text-center transition hover:bg-zinc-500/10 dark:border-zinc-700/80 dark:bg-zinc-800/70 dark:hover:bg-zinc-800"
    >
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-2 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            {wallet.name}
          </div>
        </div>
      </div>

      {(showBalance || showAmount) && (
        <Divider
          variant="dashed"
          className="border-border w-full dark:border-zinc-700"
        />
      )}

      <div className="w-full">
        {showBalance && (
          <div className="m-2 rounded border border-purple-500/20 bg-purple-500/10 p-2 font-semibold text-purple-600 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-300">
            {Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
            }).format(wallet?.balance || 0)}{' '}
          </div>
        )}

        {/* {showAmount && (
          <div className="m-2 rounded border border-blue-500/20 bg-blue-500/10 p-2 font-semibold text-blue-600 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300">
            {`${amount ?? count} ${t('transactions').toLowerCase()}`}
          </div>
        )} */}
      </div>
    </Link>
  );
};

export default WalletCard;
