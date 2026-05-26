import { formatCurrency } from '@tuturuuu/utils/format';
import { FINANCE_HIDDEN_AMOUNT } from '../shared/use-finance-confidential-visibility';

type RecalculationTranslationKey =
  | 'ws-invoices.frontend_calculated'
  | 'ws-invoices.rounding'
  | 'ws-invoices.server_calculated';

type RecalculationTranslation = (key: RecalculationTranslationKey) => string;

interface InvoicePromotionValueOptions {
  areNumbersHidden: boolean;
  currency: string;
  referralPercent?: number | null;
  useRatio?: boolean | null;
  value?: number | null;
}

interface InvoiceRecalculationDescriptionOptions {
  areNumbersHidden: boolean;
  calculatedTotal: number;
  currency: string;
  frontendTotal: number;
  roundingApplied: number;
  t: RecalculationTranslation;
}

export function formatInvoicePromotionValue({
  areNumbersHidden,
  currency,
  referralPercent,
  useRatio,
  value,
}: InvoicePromotionValueOptions) {
  if (areNumbersHidden) return FINANCE_HIDDEN_AMOUNT;

  if (referralPercent !== null && referralPercent !== undefined) {
    return `${referralPercent || 0}%`;
  }

  if (useRatio) return `${value || 0}%`;

  return formatCurrency(value || 0, currency);
}

export function formatInvoiceRecalculationDescription({
  areNumbersHidden,
  calculatedTotal,
  currency,
  frontendTotal,
  roundingApplied,
  t,
}: InvoiceRecalculationDescriptionOptions) {
  const formatAmount = (amount: number) =>
    areNumbersHidden ? FINANCE_HIDDEN_AMOUNT : formatCurrency(amount, currency);

  const roundingInfo =
    roundingApplied !== 0
      ? ` | ${t('ws-invoices.rounding')}: ${formatAmount(roundingApplied)}`
      : '';

  return `${t('ws-invoices.server_calculated')}: ${formatAmount(
    calculatedTotal
  )} | ${t('ws-invoices.frontend_calculated')}: ${formatAmount(
    frontendTotal
  )}${roundingInfo}`;
}
