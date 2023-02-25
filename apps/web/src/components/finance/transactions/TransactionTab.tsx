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
  const expenseCss = 'bg-red-300/10 p-3 text-red-300 hover:bg-red-300/20';
  const incomeCss = 'bg-blue-300/10 p-3 text-blue-300 hover:bg-blue-300/20';

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg transition hover:cursor-pointer ${
        transaction.amount < 0 ? expenseCss : incomeCss
      }`}
    >
      <div className="font-semibold">{transaction?.name || 'Unknown'}</div>
      <div className=" text-2xl font-bold">
        {transaction.amount >= 0 ? '+' : '-'}
        {Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
        }).format(Math.abs(transaction.amount) || 0)}
      </div>
    </button>
  );
}
