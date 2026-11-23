import { useQueryState } from 'nuqs';
import { useState } from 'react';
import { clampPrepaidMonthCount } from '../pending-invoice-coverage';

/**
 * Prepaid month count for a subscription invoice. A pending-list link
 * pre-selects the owed range through `prepaid_month_count`; once the operator
 * picks a count, that choice wins over the link.
 */
export function usePrepaidMonthCount() {
  const [prefilled] = useQueryState('prepaid_month_count', {
    parse: (value) => {
      const parsed = Number(value);
      return Number.isInteger(parsed) ? parsed : null;
    },
  });
  const [choice, setChoice] = useState<number | null>(null);

  return [choice ?? clampPrepaidMonthCount(prefilled), setChoice] as const;
}
