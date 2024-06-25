import {
  billCouponsMapping,
  billPackagesMapping,
  billsMapping,
  classAttendanceMapping,
  classMembersMapping,
  classPackagesMapping,
  classScoresMapping,
  classesMapping,
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
  walletTransactionsMapping,
  walletsMapping,
  warehousesMapping,
} from './module-mappings';

const availableModules = [
  // TUTURUUU-RELATED MODULES
  'warehouses',
  'product-categories',
  'product-units',
  'transaction-categories',

  // EXTERNAL MODULES
  'payment-methods',
  'roles',
  'users',
  'classes',
  'packages',
  'coupons',
  'wallets',
  'bills',
  'bill-packages',
  'bill-coupons',
  'user-coupons',
  'lessons',
  'score-names',
  'grouped-score-names', //! TUTURUUU-RELATED
  'class-scores',
  'class-members',
  'class-packages',
  'class-attendance',
  'student-feedbacks',
  'package-stock-changes',
  'user-monthly-reports',
  'user-monthly-report-logs',
  'user-status-changes',
  'wallet-transactions',

  // TUTURUUU-RELATED MODULES
  'product-prices',
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
        break;

      case 'bill-packages':
        // baseModule.name = 'Invoice Products';
        baseModule.mapping = billPackagesMapping;
        break;

      case 'class-attendance':
        // baseModule.name = 'User Group Attendances';
        baseModule.mapping = classAttendanceMapping;
        break;

      case 'class-members':
        // baseModule.name = 'User Group Members';
        baseModule.externalPath = `/migrate/user-group-users`;
        baseModule.mapping = classMembersMapping;
        break;

      case 'class-packages':
        // baseModule.name = 'User Group Linked Products';
        baseModule.mapping = classPackagesMapping;
        break;

      case 'class-scores':
        // baseModule.name = 'User Group Indicators';
        baseModule.mapping = classScoresMapping;
        break;

      case 'package-stock-changes':
        // baseModule.name = 'Product Stock Changes';
        baseModule.mapping = packageStockChangesMapping;
        break;

      case 'payment-methods':
        // baseModule.name = 'Wallets';
        baseModule.mapping = paymentMethodsMapping;
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
        // baseModule.name = 'User Group Indicators';
        baseModule.externalPath = `/migrate/score-names`;
        baseModule.mapping = groupedScoreNamesMapping;
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
        baseModule.skip = true;
        break;

      case 'wallets':
        // baseModule.name = 'Wallets';
        baseModule.mapping = walletsMapping;
        baseModule.skip = true;
        break;

      //* TUTURUUU-RELATED MODULES

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
        baseModule.externalPath = `/migrate/packages`;
        baseModule.mapping = productPricesMapping;
        break;

      default:
        throw new Error(`Module ${mod} is not supported`);
    }

    modules.push(baseModule);
  }

  return modules;
};
