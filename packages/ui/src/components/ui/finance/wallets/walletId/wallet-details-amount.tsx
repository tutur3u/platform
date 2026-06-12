'use client';

import {
  BookOpen,
  Scale,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import type { ExchangeRate } from '@tuturuuu/utils/exchange-rates';
import { convertCurrency } from '@tuturuuu/utils/exchange-rates';
import { cn, formatCurrency, getCurrencyLocale } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useFinanceBalanceMode } from '../../shared/use-finance-balance-mode';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../../shared/use-finance-confidential-visibility';
import {
  getWalletBalanceTone,
  resolveWalletBalanceForMode,
} from '../../shared/wallet-balance-mode';

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

type AmountBadgeTone = ReturnType<typeof getWalletBalanceTone> | 'varied';

function getAmountBadgeClassName(tone: AmountBadgeTone) {
  if (tone === 'varied') {
    return 'border-dynamic-orange/40 bg-dynamic-orange/10 font-semibold text-dynamic-orange';
  }

  if (tone === 'positive') {
    return 'border-dynamic-green/30 bg-dynamic-green/10 font-semibold text-dynamic-green';
  }

  if (tone === 'negative') {
    return 'border-dynamic-red/30 bg-dynamic-red/10 font-semibold text-dynamic-red';
  }

  return 'font-semibold text-muted-foreground';
}

function getContextAmountBadgeClassName(tone: 'ledger' | 'variance') {
  if (tone === 'ledger') {
    return 'border-dynamic-blue/30 bg-dynamic-blue/10 font-semibold text-dynamic-blue';
  }

  return 'border-dynamic-purple/30 bg-dynamic-purple/10 font-semibold text-dynamic-purple';
}

function AmountBadge({
  children,
  icon,
  tone,
}: {
  children: ReactNode;
  icon?: ReactNode;
  tone: AmountBadgeTone;
}) {
  return (
    <Badge
      variant="outline"
      data-wallet-details-balance-badge={tone}
      className={cn(
        'flex w-fit items-center gap-1 whitespace-nowrap px-2 py-1 text-sm',
        getAmountBadgeClassName(tone)
      )}
    >
      {icon}
      <span>{children}</span>
    </Badge>
  );
}

function ContextAmountBadge({
  children,
  icon,
  label,
  tone,
}: {
  children: ReactNode;
  icon?: ReactNode;
  label: string;
  tone: 'ledger' | 'variance';
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'flex w-fit items-center gap-1 whitespace-nowrap',
        getContextAmountBadgeClassName(tone)
      )}
    >
      {icon}
      <span className="font-medium opacity-75">{label}</span>
      <span>{children}</span>
    </Badge>
  );
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
  const { mode } = useFinanceBalanceMode();

  if (areNumbersHidden) {
    return (
      <Badge variant="outline" className="font-semibold text-muted-foreground">
        {FINANCE_HIDDEN_AMOUNT}
      </Badge>
    );
  }

  const {
    auditStatus: resolvedAuditStatus,
    auditVariance: resolvedAuditVariance,
    contextBalance,
    displayBalance,
    hasAuditedBalance,
    isAuditedMode,
  } = resolveWalletBalanceForMode(
    {
      audit_balance: auditedBalance,
      audit_status: auditStatus ?? undefined,
      audit_variance: auditVariance,
      balance: ledgerBalance,
    },
    mode
  );
  const hasResolvableBalance =
    typeof ledgerBalance === 'number' || typeof auditedBalance === 'number';
  const resolvedCurrency = currency ?? 'USD';
  const resolvedWorkspaceCurrency = workspaceCurrency ?? resolvedCurrency;
  const displayPrimary = hasResolvableBalance
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
    hasAuditedBalance &&
    resolvedAuditStatus &&
    resolvedAuditStatus !== 'clean' &&
    resolvedAuditStatus !== 'no_checkpoint' &&
    resolvedAuditVariance !== null &&
    resolvedAuditVariance !== 0;
  const displayTone = showAuditContext
    ? 'varied'
    : getWalletBalanceTone(displayBalance);

  return (
    <span className="inline-flex flex-col items-start gap-1 align-middle">
      <span className="flex flex-wrap items-center gap-1.5">
        <AmountBadge
          tone={displayTone}
          icon={
            displayTone === 'positive' ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : displayTone === 'negative' ? (
              <TrendingDown className="h-3.5 w-3.5" />
            ) : displayTone === 'varied' ? (
              <TriangleAlert className="h-3.5 w-3.5" />
            ) : undefined
          }
        >
          {displayPrimary}
        </AmountBadge>
        {displayConverted && (
          <span className="rounded-md border bg-muted/40 px-2 py-0.5 text-muted-foreground text-xs">
            {'\u2248'} {displayConverted}
          </span>
        )}
      </span>
      {showAuditContext && typeof contextBalance === 'number' && (
        <span className="flex flex-wrap items-center gap-1.5">
          <ContextAmountBadge
            tone="ledger"
            icon={<BookOpen className="h-3 w-3" />}
            label={isAuditedMode ? t('ledger') : t('audited')}
          >
            {formatCurrency(contextBalance, resolvedCurrency, undefined, {
              signDisplay: 'auto',
            })}
          </ContextAmountBadge>
          <ContextAmountBadge
            tone="variance"
            icon={<Scale className="h-3 w-3" />}
            label={t('variance')}
          >
            {formatCurrency(
              resolvedAuditVariance ?? 0,
              resolvedCurrency,
              undefined,
              { signDisplay: 'always' }
            )}
          </ContextAmountBadge>
        </span>
      )}
      {isAuditedMode && resolvedAuditStatus === 'no_checkpoint' && (
        <span className="text-muted-foreground text-xs">
          {t('no_checkpoint_short')}
        </span>
      )}
    </span>
  );
}
