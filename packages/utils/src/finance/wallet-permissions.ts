import type { PermissionId } from '@tuturuuu/types/db';

export const CHANGE_FINANCE_WALLETS_PERMISSION =
  'change_finance_wallets' as const;
export const SET_FINANCE_WALLETS_ON_CREATE_PERMISSION =
  'set_finance_wallets_on_create' as const;

type FinanceWalletPermissionLookup = {
  withoutPermission: (permission: PermissionId) => boolean;
};

interface FinanceWalletCreateAccessOptions {
  permissions: FinanceWalletPermissionLookup;
  defaultWalletId?: string | null;
  requestedWalletId?: string | null;
}

interface FinanceWalletReassignmentOptions {
  permissions: FinanceWalletPermissionLookup;
  currentWalletId?: string | null;
  requestedWalletId?: string | null;
}

interface FinanceWalletCreateLockOptions {
  defaultWalletId?: string | null;
  canChangeFinanceWallets?: boolean;
  canSetFinanceWalletsOnCreate?: boolean;
}

export function canChangeLinkedFinanceWallets(
  permissions: FinanceWalletPermissionLookup
) {
  return !permissions.withoutPermission(CHANGE_FINANCE_WALLETS_PERMISSION);
}

export function canSetAnyFinanceWalletOnCreate(
  permissions: FinanceWalletPermissionLookup
) {
  return (
    canChangeLinkedFinanceWallets(permissions) ||
    !permissions.withoutPermission(SET_FINANCE_WALLETS_ON_CREATE_PERMISSION)
  );
}

export function canUseRequestedFinanceWalletOnCreate({
  permissions,
  defaultWalletId,
  requestedWalletId,
}: FinanceWalletCreateAccessOptions) {
  if (!defaultWalletId || requestedWalletId === defaultWalletId) {
    return true;
  }

  return canSetAnyFinanceWalletOnCreate(permissions);
}

export function canReassignFinanceWallet({
  permissions,
  currentWalletId,
  requestedWalletId,
}: FinanceWalletReassignmentOptions) {
  if (
    requestedWalletId === undefined ||
    requestedWalletId === currentWalletId
  ) {
    return true;
  }

  return canChangeLinkedFinanceWallets(permissions);
}

export function shouldLockFinanceWalletSelectionOnCreate({
  defaultWalletId,
  canChangeFinanceWallets = false,
  canSetFinanceWalletsOnCreate = false,
}: FinanceWalletCreateLockOptions) {
  return (
    !!defaultWalletId &&
    !canChangeFinanceWallets &&
    !canSetFinanceWalletsOnCreate
  );
}
