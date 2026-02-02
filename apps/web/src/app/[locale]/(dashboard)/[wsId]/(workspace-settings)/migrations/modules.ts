import {
  billCouponsMapping,
  billPackagesMapping,
  billsMapping,
  classAttendanceMapping,
  classesMapping,
  classMembersMapping,
  classPackagesMapping,
  classScoresMapping,
  couponsMapping,
  groupedScoreNamesMapping,
  lessonsMapping,
  packageStockChangesMapping,
  packagesMapping,
  paymentMethodsMapping,
  productCategoriesMapping,
  productPricesMapping,
  productUnitsMapping,
  rolesMapping,
  scoreNamesMapping,
  studentFeedbacksMapping,
  transactionCategoriesMapping,
  userCouponsMapping,
  userMonthlyReportLogsMapping,
  userMonthlyReportsMapping,
  userStatusChangesMapping,
  usersMapping,
  walletsMapping,
  walletTransactionsMapping,
  warehousesMapping,
} from './module-mappings';

const availableModules = [
  // Users module - Legacy mode only (use workspace-users for Tuturuuu mode)
  'users',

  // TUTURUUU-RELATED MODULES (Workspace Users) - sync first
  'workspace-users',
  'workspace-user-fields',
  'workspace-user-groups',
  'workspace-user-groups-users',
  'workspace-user-group-tags',
  'workspace-user-group-tag-groups',
  'workspace-user-linked-users',
  'workspace-user-status-changes',

  // TUTURUUU-RELATED MODULES (Inventory) - after users
  // Order matters: warehouses, product-categories, product-units first (no FKs to other inventory tables)
  // Then packages (workspace_products) which inventory-products references
  // Then inventory-products, batches, batch-products
  'warehouses',
  'product-categories',
  'product-units',
  'inventory-suppliers',
  'packages',
  'inventory-products',
  'inventory-batches',
  'inventory-batch-products',
  'transaction-categories',

  // TUTURUUU-RELATED MODULES (Wallets) - BEFORE finance (invoices reference transactions)
  'workspace-wallets',
  'wallet-transactions',
  'credit-wallets',
  'wallet-types',
  'wallet-transaction-tags',
  'workspace-wallet-transfers',

  // TUTURUUU-RELATED MODULES (Finance) - after wallets
  'coupons', // Must come before finance-invoice-promotions (FK constraint on promo_id)
  'finance-budgets',
  'finance-invoices',
  'finance-invoice-products',
  'finance-invoice-promotions',
  'finance-invoice-user-groups',
  'finance-invoice-transaction-links', // Relinks invoice->transaction FKs after both are migrated

  // Workspace settings - run BEFORE coupons to clear referral_promotion_id FK
  // (target workspace may have auto-created settings with FK reference)
  'workspace-settings',

  // EXTERNAL/LEGACY MODULES
  'payment-methods',
  'roles',
  'classes',
  'wallets',
  'bills',
  'bill-packages',
  'bill-coupons',
  'user-coupons',
  'lessons',
  'score-names',
  'grouped-score-names',
  'class-scores',
  'class-members',
  'class-packages',
  'class-attendance',
  'student-feedbacks',
  'package-stock-changes',
  'user-monthly-reports',
  'user-monthly-report-logs',
  'user-status-changes',

  // TUTURUUU-RELATED MODULES (run last)
  'product-prices',
  'workspace-configs',
] as const;

export type MigrationModule = (typeof availableModules)[number];

export interface ModulePackage {
  name: string;
  module: MigrationModule;
  externalAlias?: string;
  externalPath: string;
  internalAlias?: string;
  internalPath?: string;
  mapping?: (wsId: string, data: any[]) => any[];
  skip?: boolean;
  disabled?: boolean;
  /** If true, this module only works in Tuturuuu mode (1:1 sync) */
  tuturuuuOnly?: boolean;
  /** If true, this module only works in Legacy mode (not available for Tuturuuu 1:1 sync) */
  legacyOnly?: boolean;
}

export const generateModules = (): ModulePackage[] => {
  const modules: ModulePackage[] = [];

  // for every possible module, generate a module package
  for (const mod of availableModules) {
    const baseModule: ModulePackage = {
      name: mod,
      module: mod,
      externalPath: `/migrate/${mod}`,
      internalPath: `/api/v1/infrastructure/migrate/${mod}`,
    };

    switch (mod as MigrationModule) {
      //* EXTERNAL MODULES
      case 'users':
        // baseModule.name = 'Virtual Users';
        baseModule.mapping = usersMapping;
        baseModule.legacyOnly = true; // Use workspace-users for Tuturuuu mode
        break;

      case 'roles':
        // baseModule.name = 'User Roles';
        baseModule.mapping = rolesMapping;
        break;

      case 'classes':
        // baseModule.name = 'User Groups (Classes)';
        baseModule.mapping = classesMapping;
        break;

      case 'bills':
        // baseModule.name = 'Invoices';
        baseModule.mapping = billsMapping;
        baseModule.legacyOnly = true; // Use finance-invoices for Tuturuuu mode
        break;

      case 'coupons':
        // baseModule.name = 'Promotions';
        baseModule.mapping = couponsMapping;
        break;

      case 'lessons':
        // baseModule.name = 'User Group Posts';
        baseModule.mapping = lessonsMapping;
        break;

      case 'bill-coupons':
        // baseModule.name = 'Invoice Promotions';
        baseModule.mapping = billCouponsMapping;
        baseModule.legacyOnly = true; // Use finance-invoice-promotions for Tuturuuu mode
        break;

      case 'bill-packages':
        // baseModule.name = 'Invoice Products';
        baseModule.mapping = billPackagesMapping;
        baseModule.legacyOnly = true; // Use finance-invoice-products for Tuturuuu mode
        break;

      case 'class-attendance':
        // baseModule.name = 'User Group Attendances';
        baseModule.mapping = classAttendanceMapping;
        break;

      case 'class-members':
        // baseModule.name = 'User Group Members';
        baseModule.externalPath = `/migrate/user-group-users`;
        baseModule.mapping = classMembersMapping;
        baseModule.legacyOnly = true; // Not applicable for Tuturuuu 1:1 sync
        break;

      case 'class-packages':
        // baseModule.name = 'User Group Linked Products';
        baseModule.mapping = classPackagesMapping;
        break;

      case 'class-scores':
        // baseModule.name = 'User Indicator Values';
        // Maps to user_indicators table (user_id, indicator_id, value)
        baseModule.mapping = classScoresMapping;
        break;

      case 'package-stock-changes':
        // baseModule.name = 'Product Stock Changes';
        baseModule.mapping = packageStockChangesMapping;
        break;

      case 'payment-methods':
        // baseModule.name = 'Wallets';
        baseModule.mapping = paymentMethodsMapping;
        baseModule.legacyOnly = true; // Not applicable for Tuturuuu 1:1 sync
        break;

      case 'packages':
        // baseModule.name = 'Products';
        baseModule.mapping = packagesMapping;
        break;

      case 'score-names':
        // baseModule.name = 'User Indicators';
        baseModule.mapping = scoreNamesMapping;
        break;

      case 'grouped-score-names':
        // baseModule.name = 'Healthcare Vitals (grouped)';
        // Maps to healthcare_vitals table, same as score-names
        baseModule.externalPath = `/migrate/score-names`;
        baseModule.mapping = groupedScoreNamesMapping;
        baseModule.legacyOnly = true; // Not applicable for Tuturuuu 1:1 sync
        break;

      case 'student-feedbacks':
        // baseModule.name = 'User Feedbacks';
        baseModule.mapping = studentFeedbacksMapping;
        break;

      case 'transaction-categories':
        // baseModule.name = 'Transaction Categories';
        baseModule.mapping = transactionCategoriesMapping;
        break;

      case 'user-coupons':
        // baseModule.name = 'Virtual Users Linked Promotions';
        baseModule.mapping = userCouponsMapping;
        break;

      case 'user-monthly-report-logs':
        // baseModule.name = 'User Monthly Report Logs';
        baseModule.mapping = userMonthlyReportLogsMapping;
        break;

      case 'user-monthly-reports':
        // baseModule.name = 'User Monthly Reports';
        baseModule.mapping = userMonthlyReportsMapping;
        break;

      case 'user-status-changes':
        // baseModule.name = 'User Status Changes';
        baseModule.mapping = userStatusChangesMapping;
        break;

      case 'wallet-transactions':
        // baseModule.name = 'Wallet transactions';
        baseModule.mapping = walletTransactionsMapping;
        // No skip - needed before finance-invoices (FK constraint)
        break;

      case 'wallets':
        // baseModule.name = 'Wallets';
        baseModule.mapping = walletsMapping;
        baseModule.legacyOnly = true; // Use workspace-wallets for Tuturuuu mode
        break;

      //* TUTURUUU-RELATED MODULES (Inventory)

      case 'inventory-products':
        // Inventory products - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'inventory-suppliers':
        // Inventory suppliers - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'inventory-batches':
        // Inventory batches - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'inventory-batch-products':
        // Inventory batch products - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      //* TUTURUUU-RELATED MODULES (Finance)

      case 'finance-budgets':
        // Finance budgets - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'finance-invoices':
        // Finance invoices - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'finance-invoice-products':
        // Finance invoice products - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'finance-invoice-promotions':
        // Finance invoice promotions - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'finance-invoice-user-groups':
        // Finance invoice user groups - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'finance-invoice-transaction-links':
        // Relinks invoice transaction_id FKs after both wallet-transactions
        // and finance-invoices have been migrated - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      //* TUTURUUU-RELATED MODULES (Wallets)

      case 'credit-wallets':
        // Credit wallets - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'wallet-types':
        // Wallet types is a global lookup table - disable for Tuturuuu mode
        baseModule.legacyOnly = true;
        break;

      case 'wallet-transaction-tags':
        // Wallet transaction tags - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'workspace-wallets':
        // Workspace wallets - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'workspace-wallet-transfers':
        // Workspace wallet transfers - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      //* TUTURUUU-RELATED MODULES (Workspace Users)

      case 'workspace-users':
        // Workspace users - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'workspace-user-fields':
        // Workspace user fields - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'workspace-user-groups':
        // Workspace user groups - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'workspace-user-groups-users':
        // Junction table (group_id, user_id) - no ws_id column, but RLS validates via related entities
        baseModule.tuturuuuOnly = true;
        break;

      case 'workspace-user-group-tags':
        // Workspace user group tags - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'workspace-user-group-tag-groups':
        // Junction table (group_id, tag_id) - no ws_id column, but RLS validates via related entities
        baseModule.tuturuuuOnly = true;
        break;

      case 'workspace-user-linked-users':
        // Workspace user linked users - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'workspace-user-status-changes':
        // Workspace user status changes - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'warehouses':
        // baseModule.name = 'Warehouses';
        baseModule.mapping = warehousesMapping;
        break;

      case 'product-categories':
        // baseModule.name = 'Product Categories';
        baseModule.mapping = productCategoriesMapping;
        break;

      case 'product-units':
        // baseModule.name = 'Product Units';
        baseModule.mapping = productUnitsMapping;
        break;

      case 'product-prices':
        // baseModule.name = 'Product Prices';
        // Maps workspace_products → inventory_products (different schemas)
        baseModule.externalPath = `/migrate/packages`;
        baseModule.mapping = productPricesMapping;
        baseModule.legacyOnly = true; // Different schemas - not suitable for 1:1 sync
        break;

      case 'workspace-settings':
        // Workspace settings - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      case 'workspace-configs':
        // Workspace configs - 1:1 sync, Tuturuuu mode only
        baseModule.tuturuuuOnly = true;
        break;

      default:
        throw new Error(`Module ${mod} is not supported`);
    }

    modules.push(baseModule);
  }

  return modules;
};
