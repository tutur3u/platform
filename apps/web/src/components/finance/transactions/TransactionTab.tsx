import { Transaction } from '../../../types/primitives/Transaction';

interface TransactionTabProps {
  transaction: Transaction;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function TransactionTab({
  transaction,
  onClick,
}: TransactionTabProps) {
  return (
    <button
      onClick={onClick}
      className="h-fit w-[50%] rounded-lg bg-yellow-300/10 p-3 text-yellow-300 transition hover:cursor-pointer hover:bg-yellow-300/20"
    >
      <div className="font-semibold">{transaction.name}</div>
      <div className=" text-2xl font-bold">
        {Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
        }).format(transaction.amount || 0)}
      </div>
    </button>
  );
}
