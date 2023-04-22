import { Divider } from '@mantine/core';
import Link from 'next/link';
import { Wallet } from '../../types/primitives/Wallet';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import useSWR from 'swr';

interface Props {
  wallet: Wallet;
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
  const { ws } = useWorkspaces();

  const countApi =
    showAmount && ws?.id && wallet?.id
      ? `/api/workspaces/${ws.id}/finance/wallets/${wallet.id}/transactions/count`
      : null;

  const { data: count } = useSWR<number>(countApi);

  if (!ws) return null;

  return (
    <Link
      href={disableLink ? '#' : `/${ws.id}/finance/wallets/${wallet.id}`}
      className="group flex flex-col items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-800/70 text-center transition hover:bg-zinc-800"
    >
      <div className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-2 text-center">
          <div className="line-clamp-1 font-semibold tracking-wide">
            {wallet.name}
          </div>
        </div>
      </div>

      {(showBalance || showAmount) && (
        <Divider variant="dashed" className="w-full border-zinc-700" />
      )}

      <div className="w-full">
        {showBalance && (
          <div className="m-2 rounded border border-purple-300/20 bg-purple-300/10 p-2 font-semibold text-purple-300">
            {Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
            }).format(wallet?.balance || 0)}{' '}
          </div>
        )}

        {showAmount && (
          <div className="m-2 rounded border border-blue-300/20 bg-blue-300/10 p-2 font-semibold text-blue-300">
            {count} giao dịch
          </div>
        )}
      </div>
    </Link>
  );
};

export default WalletCard;
