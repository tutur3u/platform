import { Divider } from '@mantine/core';
import Link from 'next/link';
import { Transaction } from '../../types/primitives/Transaction';
import { useWorkspaces } from '../../hooks/useWorkspaces';

interface Props {
  transaction: Transaction;
  showAmount?: boolean;
  redirectToWallets?: boolean;
}

const TransactionCard = ({
  transaction,
  showAmount = false,
  redirectToWallets = false,
}: Props) => {
  const { ws } = useWorkspaces();
  if (!ws) return null;

  return (
    <Link
      href={`/${ws.id}/finance/transactions/${transaction.id}${
        redirectToWallets ? '?redirectToWallets=true' : ''
      }`}
      className="group flex flex-col items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-800/70 text-center transition hover:bg-zinc-800"
    >
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-4 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            {transaction.description}
          </div>
        </div>
      </div>

      {showAmount && (
        <>
          <Divider variant="dashed" className="w-full border-zinc-700" />
          <div className="w-full">
            <div className="m-2 rounded border border-purple-300/20 bg-purple-300/10 p-2 font-semibold text-purple-300">
              {Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
              }).format(transaction?.amount || 0)}{' '}
            </div>
          </div>
        </>
      )}
    </Link>
  );
};

export default TransactionCard;
