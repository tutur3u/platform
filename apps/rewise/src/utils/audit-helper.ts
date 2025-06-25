import type { AuditLog, Operation } from '@tuturuuu/types/primitives/audit-log';

type TranslationFunction = (
  key: string,
  params?: Record<string, unknown>
) => string;

const getLeadingLabel = (
  t: TranslationFunction,
  op: Operation,
  table: string
) => {
  switch (op) {
    case 'INSERT':
      return t(`leading_label_${table}_insert`);
    case 'UPDATE':
      return t(`leading_label_${table}_update`);
    case 'DELETE':
      return t(`leading_label_${table}_delete`);
    default:
      return t('common.unknown');
  }
};

const getAmount = (data: AuditLog) => {
  switch (data.op) {
    case 'INSERT':
      return data.record ? Object.keys(data.record).length : 0;
    case 'UPDATE':
      return data.old_record ? Object.keys(data.old_record).length : 0;
    case 'DELETE':
      return data.old_record ? Object.keys(data.old_record).length : 0;
    default:
      return 0;
  }
};

const getTrailingLabel = (t: TranslationFunction, data: AuditLog) =>
  t(`trailing_label_${data.table_name}`, { count: getAmount(data) });

export const getLabel = (t: TranslationFunction, data: AuditLog) => {
  const leadingLabel = getLeadingLabel(t, data.op, data.table_name);
  const trailingLabel = getTrailingLabel(t, data);

  return `${leadingLabel} ${trailingLabel}`;
};
