interface WalletTabProps {
  name: string;
  balance: number;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function WalletTab({ name, balance, onClick }: WalletTabProps) {
  return (
    <button
      onClick={onClick}
      className="h-fit w-full rounded-lg bg-green-300/10 p-3 text-green-300 transition hover:cursor-pointer hover:bg-green-300/20"
    >
      <div className="font-semibold">{name}</div>
      <div className=" text-2xl font-bold">
        {Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
        }).format(balance || 0)}
      </div>
    </button>
  );
}
