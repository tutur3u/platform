import { Divider } from '@mantine/core';
import Link from 'next/link';
import { Transaction } from '../../types/primitives/Transaction';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import moment from 'moment';
import { Wallet } from '../../types/primitives/Wallet';
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
      className="group flex flex-col items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-800/70 text-center transition hover:bg-zinc-800"
    >
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-2 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            {transaction.description || 'Không có mô tả'}
          </div>
        </div>
      </div>

      {showExtra && (
        <>
          <Divider variant="dashed" className="w-full border-zinc-700" />

          <div className="w-full">
            {showAmount && (
              <div className="m-2 rounded border border-purple-300/20 bg-purple-300/10 p-2 font-semibold text-purple-300">
                {transaction?.amount === 0
                  ? 'Miễn phí'
                  : Intl.NumberFormat('vi-VN', {
                      style: 'currency',
                      currency: 'VND',
                      signDisplay: 'always',
                    }).format(transaction?.amount || 0)}{' '}
              </div>
            )}

            {showWallet && (
              <div className="m-2 rounded border border-green-300/20 bg-green-300/10 p-2 font-semibold text-green-300">
                {wallet?.name || 'Nguồn tiền không tên'}
              </div>
            )}

            {showDatetime && (
              <div className="m-2 rounded border border-orange-300/20 bg-orange-300/10 p-2 font-semibold text-orange-300">
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
