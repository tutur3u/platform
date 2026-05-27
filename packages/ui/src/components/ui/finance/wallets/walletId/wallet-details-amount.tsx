'use client';

import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../../shared/use-finance-confidential-visibility';

interface WalletDetailsAmountProps {
  primary: string;
  converted?: string | null;
}

export function WalletDetailsAmount({
  primary,
  converted,
}: WalletDetailsAmountProps) {
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();

  if (areNumbersHidden) {
    return (
      <span className="text-muted-foreground">{FINANCE_HIDDEN_AMOUNT}</span>
    );
  }

  return (
    <span>
      {primary}
      {converted && (
        <span className="ml-2 text-muted-foreground text-sm">
          {'\u2248'} {converted}
        </span>
      )}
    </span>
  );
}
