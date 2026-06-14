import { describe, expect, it } from 'vitest';
import { buildFinanceCommandActionGroups } from './finance-command-actions';

const translate = (key: string) => key;

describe('buildFinanceCommandActionGroups', () => {
  it('exposes create and utility commands when permissions allow them', () => {
    const groups = buildFinanceCommandActionGroups({
      permissions: {
        canCreateDebts: true,
        canCreateInvoices: true,
        canCreateRecurringTransactions: true,
        canCreateTransactions: true,
        canCreateWallets: true,
        canExportFinanceData: true,
        canManageFinance: true,
        canUpdateWallets: true,
      },
      tCommand: translate,
      tFinance: translate,
    });

    const ids = groups.flatMap((group) => group.items.map((item) => item.id));

    expect(ids).toContain('new-transaction');
    expect(ids).toContain('new-transfer');
    expect(ids).toContain('import-transactions');
    expect(ids).toContain('export-transactions');
    expect(ids).toContain('all-wallet-check');
  });

  it('hides transaction and wallet commands without permission', () => {
    const groups = buildFinanceCommandActionGroups({
      permissions: {
        canCreateTransactions: false,
        canCreateWallets: false,
      },
      tCommand: translate,
      tFinance: translate,
    });

    const ids = groups.flatMap((group) => group.items.map((item) => item.id));

    expect(ids).not.toContain('new-transaction');
    expect(ids).not.toContain('new-transfer');
    expect(ids).not.toContain('new-wallet');
  });
});
