import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { describe, expect, it } from 'vitest';
import { walletColumns } from './columns';

function getBalanceAccessor(balanceMode: 'audited' | 'ledger') {
  const columns = walletColumns({
    extraData: {
      balanceMode,
      currency: 'USD',
    },
    namespace: 'wallet-data-table',
    t: (key: string) => key,
  });
  const balanceColumn = columns.find((column) => column.id === 'balance');

  if (!balanceColumn || !('accessorFn' in balanceColumn)) {
    throw new Error('Expected balance column accessor');
  }

  return balanceColumn.accessorFn as (wallet: Wallet) => number;
}

describe('wallet columns', () => {
  it('sorts the balance column by ledger balance in ledger mode', () => {
    const accessor = getBalanceAccessor('ledger');

    expect(
      accessor({
        audit_balance: 500,
        balance: 100,
      } as Wallet)
    ).toBe(100);
  });

  it('sorts the balance column by audited balance in audited mode', () => {
    const accessor = getBalanceAccessor('audited');

    expect(
      accessor({
        audit_balance: -50,
        balance: 100,
      } as Wallet)
    ).toBe(-50);
  });

  it('falls back to ledger balance for audited sorting without a checkpoint', () => {
    const accessor = getBalanceAccessor('audited');

    expect(
      accessor({
        audit_status: 'no_checkpoint',
        balance: 100,
      } as Wallet)
    ).toBe(100);
  });
});
