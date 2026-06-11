'use client';

import type { ExchangeRate } from '@tuturuuu/utils/exchange-rates';
import { convertCurrency } from '@tuturuuu/utils/exchange-rates';
import { formatCurrency, getCurrencyLocale } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useFinanceBalanceMode } from '../../shared/use-finance-balance-mode';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../../shared/use-finance-confidential-visibility';

interface WalletDetailsAmountProps {
  auditedBalance?: number | null;
  auditStatus?: 'clean' | 'no_checkpoint' | 'unresolved' | null;
  auditVariance?: number | null;
  currency?: string;
  primary: string;
  converted?: string | null;
  exchangeRates?: ExchangeRate[];
  ledgerBalance?: number | null;
  workspaceCurrency?: string | null;
}

export function WalletDetailsAmount({
  auditedBalance,
  auditStatus,
  auditVariance,
  currency,
  primary,
  converted,
  exchangeRates,
  ledgerBalance,
  workspaceCurrency,
}: WalletDetailsAmountProps) {
  const t = useTranslations('wallet-checkpoints');
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();
  const { isAuditedMode } = useFinanceBalanceMode();

  if (areNumbersHidden) {
    return (
      <span className="text-muted-foreground">{FINANCE_HIDDEN_AMOUNT}</span>
    );
  }

  const hasLedgerBalance = typeof ledgerBalance === 'number';
  const hasAuditedBalance = typeof auditedBalance === 'number';
  const displayBalance =
    isAuditedMode && hasAuditedBalance ? auditedBalance : ledgerBalance;
  const contextBalance =
    isAuditedMode && hasAuditedBalance ? ledgerBalance : auditedBalance;
  const resolvedCurrency = currency ?? 'USD';
  const resolvedWorkspaceCurrency = workspaceCurrency ?? resolvedCurrency;
  const displayPrimary =
    typeof displayBalance === 'number'
      ? Intl.NumberFormat(getCurrencyLocale(resolvedCurrency), {
          style: 'currency',
          currency: resolvedCurrency,
        }).format(displayBalance)
      : primary;
  let displayConverted = converted;

  if (
    typeof displayBalance === 'number' &&
    resolvedCurrency !== resolvedWorkspaceCurrency &&
    exchangeRates &&
    exchangeRates.length > 0 &&
    displayBalance !== 0
  ) {
    const convertedBalance = convertCurrency(
      displayBalance,
      resolvedCurrency,
      resolvedWorkspaceCurrency,
      exchangeRates
    );

    if (convertedBalance !== null) {
      displayConverted = formatCurrency(
        Math.abs(convertedBalance),
        resolvedWorkspaceCurrency,
        undefined,
        { signDisplay: 'never', maximumFractionDigits: 0 }
      );
    }
  }

  const showAuditContext =
    hasLedgerBalance &&
    hasAuditedBalance &&
    auditStatus &&
    auditStatus !== 'no_checkpoint';

  return (
    <span className="inline-flex flex-col gap-0.5 align-middle">
      <span>
        {displayPrimary}
        {displayConverted && (
          <span className="ml-2 text-muted-foreground text-sm">
            {'\u2248'} {displayConverted}
          </span>
        )}
      </span>
      {showAuditContext && typeof contextBalance === 'number' && (
        <span className="text-muted-foreground text-xs">
          {isAuditedMode ? t('ledger') : t('audited')}:{' '}
          {formatCurrency(contextBalance, resolvedCurrency, undefined, {
            signDisplay: 'auto',
          })}
          {typeof auditVariance === 'number'
            ? ` · ${t('variance')}: ${formatCurrency(
                auditVariance,
                resolvedCurrency,
                undefined,
                { signDisplay: 'always' }
              )}`
            : null}
        </span>
      )}
      {isAuditedMode && auditStatus === 'no_checkpoint' && (
        <span className="text-muted-foreground text-xs">
          {t('no_checkpoint_short')}
        </span>
      )}
    </span>
  );
}
