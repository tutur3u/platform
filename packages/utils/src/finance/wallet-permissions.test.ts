import { describe, expect, it } from 'vitest';
import {
  CHANGE_FINANCE_WALLETS_PERMISSION,
  canChangeLinkedFinanceWallets,
  canReassignFinanceWallet,
  canSetAnyFinanceWalletOnCreate,
  canUseRequestedFinanceWalletOnCreate,
  SET_FINANCE_WALLETS_ON_CREATE_PERMISSION,
  shouldLockFinanceWalletSelectionOnCreate,
} from './wallet-permissions';

function createPermissions(granted: string[]) {
  const grantedSet = new Set(granted);

  return {
    withoutPermission: (permission: string) => !grantedSet.has(permission),
  };
}

describe('finance wallet permissions', () => {
  it('allows non-default wallet selection on create with either create-only or full wallet permission', () => {
    const noWalletPermissions = createPermissions([]);
    const createOnlyPermissions = createPermissions([
      SET_FINANCE_WALLETS_ON_CREATE_PERMISSION,
    ]);
    const fullPermissions = createPermissions([
      CHANGE_FINANCE_WALLETS_PERMISSION,
    ]);

    expect(
      canUseRequestedFinanceWalletOnCreate({
        permissions: noWalletPermissions,
        defaultWalletId: 'wallet-default',
        requestedWalletId: 'wallet-alt',
      })
    ).toBe(false);

    expect(
      canUseRequestedFinanceWalletOnCreate({
        permissions: createOnlyPermissions,
        defaultWalletId: 'wallet-default',
        requestedWalletId: 'wallet-alt',
      })
    ).toBe(true);

    expect(
      canUseRequestedFinanceWalletOnCreate({
        permissions: fullPermissions,
        defaultWalletId: 'wallet-default',
        requestedWalletId: 'wallet-alt',
      })
    ).toBe(true);
  });

  it('allows create flows when no override is needed', () => {
    const noWalletPermissions = createPermissions([]);

    expect(
      canUseRequestedFinanceWalletOnCreate({
        permissions: noWalletPermissions,
        defaultWalletId: undefined,
        requestedWalletId: 'wallet-alt',
      })
    ).toBe(true);

    expect(
      canUseRequestedFinanceWalletOnCreate({
        permissions: noWalletPermissions,
        defaultWalletId: 'wallet-default',
        requestedWalletId: 'wallet-default',
      })
    ).toBe(true);
  });

  it('keeps reassignment restricted to the full wallet-change permission', () => {
    const createOnlyPermissions = createPermissions([
      SET_FINANCE_WALLETS_ON_CREATE_PERMISSION,
    ]);
    const fullPermissions = createPermissions([
      CHANGE_FINANCE_WALLETS_PERMISSION,
    ]);

    expect(
      canReassignFinanceWallet({
        permissions: createOnlyPermissions,
        currentWalletId: 'wallet-default',
        requestedWalletId: 'wallet-alt',
      })
    ).toBe(false);

    expect(
      canReassignFinanceWallet({
        permissions: fullPermissions,
        currentWalletId: 'wallet-default',
        requestedWalletId: 'wallet-alt',
      })
    ).toBe(true);
  });

  it('treats unchanged or omitted wallet updates as allowed', () => {
    const noWalletPermissions = createPermissions([]);

    expect(
      canReassignFinanceWallet({
        permissions: noWalletPermissions,
        currentWalletId: 'wallet-default',
        requestedWalletId: 'wallet-default',
      })
    ).toBe(true);

    expect(
      canReassignFinanceWallet({
        permissions: noWalletPermissions,
        currentWalletId: 'wallet-default',
        requestedWalletId: undefined,
      })
    ).toBe(true);
  });

  it('surfaces helper booleans for create-only and full wallet access', () => {
    expect(canChangeLinkedFinanceWallets(createPermissions([]))).toBe(false);
    expect(
      canChangeLinkedFinanceWallets(
        createPermissions([CHANGE_FINANCE_WALLETS_PERMISSION])
      )
    ).toBe(true);

    expect(canSetAnyFinanceWalletOnCreate(createPermissions([]))).toBe(false);
    expect(
      canSetAnyFinanceWalletOnCreate(
        createPermissions([SET_FINANCE_WALLETS_ON_CREATE_PERMISSION])
      )
    ).toBe(true);
  });

  it('locks create-form wallet selection only when neither wallet override permission is present', () => {
    expect(
      shouldLockFinanceWalletSelectionOnCreate({
        defaultWalletId: 'wallet-default',
        canChangeFinanceWallets: false,
        canSetFinanceWalletsOnCreate: false,
      })
    ).toBe(true);

    expect(
      shouldLockFinanceWalletSelectionOnCreate({
        defaultWalletId: 'wallet-default',
        canChangeFinanceWallets: false,
        canSetFinanceWalletsOnCreate: true,
      })
    ).toBe(false);

    expect(
      shouldLockFinanceWalletSelectionOnCreate({
        defaultWalletId: 'wallet-default',
        canChangeFinanceWallets: true,
        canSetFinanceWalletsOnCreate: false,
      })
    ).toBe(false);

    expect(
      shouldLockFinanceWalletSelectionOnCreate({
        defaultWalletId: undefined,
        canChangeFinanceWallets: false,
        canSetFinanceWalletsOnCreate: false,
      })
    ).toBe(false);
  });
});
