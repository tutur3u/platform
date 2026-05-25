'use client';

import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from './use-finance-confidential-visibility';

interface FinanceDisplayAmountProps {
  value: string;
  className?: string;
}

export function FinanceDisplayAmount({
  value,
  className,
}: FinanceDisplayAmountProps) {
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();

  return (
    <span className={className}>
      {areNumbersHidden ? FINANCE_HIDDEN_AMOUNT : value}
    </span>
  );
}
