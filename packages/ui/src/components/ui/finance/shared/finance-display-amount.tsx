'use client';

import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from './use-finance-confidential-visibility';

interface FinanceDisplayAmountProps {
  value: string;
  className?: string;
  alwaysShow?: boolean;
}

export function FinanceDisplayAmount({
  value,
  className,
  alwaysShow = false,
}: FinanceDisplayAmountProps) {
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();

  return (
    <span className={className}>
      {areNumbersHidden && !alwaysShow ? FINANCE_HIDDEN_AMOUNT : value}
    </span>
  );
}
