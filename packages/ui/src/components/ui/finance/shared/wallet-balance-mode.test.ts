import { describe, expect, it } from 'vitest';
import {
  getWalletBalanceTone,
  resolveWalletBalanceForMode,
} from './wallet-balance-mode';

describe('wallet balance mode resolver', () => {
  it('uses ledger balance in ledger mode', () => {
    expect(
      resolveWalletBalanceForMode(
        {
          audit_balance: 150,
          audit_status: 'unresolved',
          balance: 100,
        },
        'ledger'
      )
    ).toMatchObject({
      contextBalance: 150,
      displayBalance: 100,
      hasAuditedBalance: true,
      usesAuditedBalance: false,
    });
  });

  it('uses audited balance in audited mode when a checkpoint exists', () => {
    expect(
      resolveWalletBalanceForMode(
        {
          audit_balance: -25,
          audit_status: 'unresolved',
          balance: 100,
        },
        'audited'
      )
    ).toMatchObject({
      contextBalance: 100,
      displayBalance: -25,
      hasAuditedBalance: true,
      usesAuditedBalance: true,
    });
  });

  it('falls back to ledger balance in audited mode without a checkpoint', () => {
    expect(
      resolveWalletBalanceForMode(
        {
          audit_status: 'no_checkpoint',
          balance: 100,
        },
        'audited'
      )
    ).toMatchObject({
      contextBalance: null,
      displayBalance: 100,
      hasAuditedBalance: false,
      usesAuditedBalance: false,
    });
  });

  it('derives tone from the effective balance', () => {
    expect(getWalletBalanceTone(10)).toBe('positive');
    expect(getWalletBalanceTone(-10)).toBe('negative');
    expect(getWalletBalanceTone(0)).toBe('neutral');
  });
});
