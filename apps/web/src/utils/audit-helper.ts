import { Translate } from 'next-translate';
import { AuditLog, Operation } from '../types/primitives/AuditLog';

const getLeadingLabel = (t: Translate, op: Operation) => {
  switch (op) {
    case 'INSERT':
      return t('created');
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

const getTrailingLabel = (t: Translate, data: AuditLog) =>
  t(`trailing_label_${data.table_name}`, { count: getAmount(data) });

export const getLabel = (t: Translate, data: AuditLog) => {
  const leadingLabel = getLeadingLabel(t, data.op);
  const trailingLabel = getTrailingLabel(t, data);

  const label = `${leadingLabel} ${trailingLabel}`;

  return label;
};
