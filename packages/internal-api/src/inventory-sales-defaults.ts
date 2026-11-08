import type { InventoryOwner } from '@tuturuuu/types/primitives/InventoryOwner';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import type { ProductUnit } from '@tuturuuu/types/primitives/ProductUnit';
import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import type { InventorySalesPeriod } from './inventory-sales-contracts';
import type { InventoryManufacturer } from './inventory';

export type InventorySalesPeriodDefaultOutcome = {
  status: 'unchanged' | 'updated' | 'failed';
};

export type InventoryProductFormOptionsResponse = {
  autoSetNewSalesPeriodAsDefault?: boolean | null;
  canEditSalesDefaults?: boolean;
  categories: ProductCategory[];
  defaultFinanceCategoryId?: string | null;
  defaultRevenueWalletId?: string | null;
  defaultSalesPeriodId?: string | null;
  defaultWalletId?: string | null;
  financeCategories: TransactionCategory[];
  manufacturers: InventoryManufacturer[];
  owners: InventoryOwner[];
  units: ProductUnit[];
  wallets?: Array<{ id: string; name: string }>;
  warehouses: ProductWarehouse[];
};

export type InventorySalesDefaultsPayload = {
  autoSetNewSalesPeriodAsDefault?: boolean;
  defaultFinanceCategoryId?: string | null;
  defaultRevenueWalletId?: string | null;
  defaultSalesPeriodId?: string | null;
};

export type InventorySalesPeriodCreateResponse = {
  data: InventorySalesPeriod;
  salesDefault?: InventorySalesPeriodDefaultOutcome;
};
