'use client';

import { formatCurrency } from '@tuturuuu/utils/format';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../../shared/use-finance-confidential-visibility';

export function WalletCheckpointAmount({
  amount,
  currency,
  signDisplay = 'auto',
}: {
  amount: number;
  currency: string;
  signDisplay?: Intl.NumberFormatOptions['signDisplay'];
}) {
  const { isConfidential } = useFinanceConfidentialVisibility();

  if (isConfidential) {
    return <span>{FINANCE_HIDDEN_AMOUNT}</span>;
  }

  return (
    <span>
      {formatCurrency(amount, currency, undefined, {
        maximumFractionDigits: currency === 'VND' ? 0 : 6,
        signDisplay,
      })}
    </span>
  );
}
