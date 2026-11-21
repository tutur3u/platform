import 'server-only';

export type { FixedEmployeeSqlOutcome } from '../../../../../packages/inventory-core/src/lib/infrastructure/employee-sql/employee-fixed-sql-process';
export {
  executeFixedEmployeeSql,
  isFixedEmployeeCommitFresh,
} from '../../../../../packages/inventory-core/src/lib/infrastructure/employee-sql/employee-fixed-sql-process';
