interface TransactionRowProps {
  wallet: string;
  category?: string;
  title: string;
  time: string;
  amount: number;
  type: string;
  desWallet?: string;
  desAccount?: string;
}

export default function TransactionRow({
  wallet,
  category,
  title,
  time,
  amount,
  type,
  desWallet,
  desAccount,
}: TransactionRowProps) {
  let sign;
  switch (type) {
    case 'Expense':
    case 'Lend':
      sign = '-';
      break;
    case 'Income':
    case 'Borrow':
      sign = '+';
      break;
    default:
      sign = '';
  }

  category = category || '';

  switch (type) {
    case 'Transfer':
      title = `Transfer to ${desWallet}`;
      break;
    case 'Adjustment':
      title = `Adjust ${wallet}`;
      break;
    case 'Lend':
      title = `Lend to ${desAccount}`;
      break;
    case 'Borrow':
      title = `Borrow from ${desAccount}`;
      break;
    default:
      break;
  }

  return (
    <>
      <div className="flex items-center justify-start gap-3">
        <div>{time}</div>
        <div>{wallet}</div>
        <div>{title}</div>
        <div>{category}</div>
        <div>{`${sign} ${amount} VND`}</div>
      </div>
    </>
  );
}
