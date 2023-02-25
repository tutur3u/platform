import { Wallet } from '../../../types/primitives/Wallet';

interface WalletTabProps {
  wallet: Wallet;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function WalletTab({ wallet, onClick }: WalletTabProps) {
  return (
    <button
      onClick={onClick}
      className="h-fit w-full rounded-lg bg-green-300/10 p-3 text-green-300 transition hover:cursor-pointer hover:bg-green-300/20"
    >
      <div className="font-semibold">{wallet?.name || ''}</div>
      <div className=" text-2xl font-bold">
        {Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
        }).format(wallet?.balance || 0)}
      </div>
    </button>
  );
}
