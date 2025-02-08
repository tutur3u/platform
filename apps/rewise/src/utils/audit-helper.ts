import { AuditLog, Operation } from '@repo/types/primitives/audit-log';

const getLeadingLabel = (t: any, op: Operation, table: string) => {
  switch (op) {
    case 'INSERT':
      if (table === 'workspace_members') return t('added');
      else return t('created');
    case 'UPDATE':
      return t('updated');
    case 'DELETE':
      return t('deleted');
  }
};

const getAmount = (data: AuditLog) => {
  switch (data.table_name) {
    case 'workspaces':
      return 0;

    default:
      return 1;
  }
};

const getTrailingLabel = (t: any, data: AuditLog) =>
  t(`trailing_label_${data.table_name}`, { count: getAmount(data) });

export const getLabel = (t: any, data: AuditLog) => {
  const leadingLabel = getLeadingLabel(t, data.op, data.table_name);
  const trailingLabel = getTrailingLabel(t, data);

  return `${leadingLabel} ${trailingLabel}`;
};
