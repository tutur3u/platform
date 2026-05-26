import { FINANCE_HIDDEN_AMOUNT } from '../shared/use-finance-confidential-visibility';

export function formatMoneyLoverImportPreviewAmount(
  amount: number,
  currency: string,
  areNumbersHidden: boolean
) {
  if (areNumbersHidden) return FINANCE_HIDDEN_AMOUNT;

  return Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    signDisplay: 'always',
  }).format(amount);
}
