import type { FinancePermissionRequestUser } from '../shared/finance-permission-warning-dialog';

export interface SubscriptionInvoiceProps {
  wsId: string;
  prefillQuantity?: number | null;
  suggestedTotal?: number | null;
  createMultipleInvoices: boolean;
  printAfterCreate?: boolean;
  downloadImageAfterCreate?: boolean;
  defaultWalletId?: string;
  defaultCategoryId?: string;
  defaultCurrency?: string;
  workspaceTimezone?: string | null;
  canChangeFinanceWallets?: boolean;
  canSetFinanceWalletsOnCreate?: boolean;
  canReadInvoiceProducts?: boolean;
  canReadInvoiceProductStock?: boolean;
  canReadGroupLinkedProducts?: boolean;
  permissionRequestUser?: FinancePermissionRequestUser | null;
}
