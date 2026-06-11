import type { FinanceBalanceMode } from './use-finance-balance-mode';

type WalletBalanceInput = {
  audit_balance?: number | null;
  audit_status?: 'clean' | 'no_checkpoint' | 'unresolved' | null;
  audit_variance?: number | null;
  balance?: number | null;
};

function toFiniteNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function resolveWalletBalanceForMode(
  wallet: WalletBalanceInput,
  mode: FinanceBalanceMode
) {
  const ledgerBalance = toFiniteNumber(wallet.balance) ?? 0;
  const auditedBalance = toFiniteNumber(wallet.audit_balance);
  const hasAuditedBalance = auditedBalance !== null;
  const usesAuditedBalance = mode === 'audited' && hasAuditedBalance;
  const displayBalance = usesAuditedBalance ? auditedBalance : ledgerBalance;
  const contextBalance = usesAuditedBalance ? ledgerBalance : auditedBalance;

  return {
    auditedBalance,
    auditStatus: wallet.audit_status ?? null,
    auditVariance: toFiniteNumber(wallet.audit_variance),
    contextBalance,
    displayBalance,
    hasAuditedBalance,
    isAuditedMode: mode === 'audited',
    ledgerBalance,
    usesAuditedBalance,
  };
}

export function getWalletBalanceTone(balance: number) {
  if (balance > 0) return 'positive';
  if (balance < 0) return 'negative';
  return 'neutral';
}
