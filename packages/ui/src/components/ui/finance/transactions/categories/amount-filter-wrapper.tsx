'use client';

import { AmountRangeFilter } from '@tuturuuu/ui/finance/transactions/categories/amount-filter';
import { parseAsFloat, parseAsInteger, useQueryState } from 'nuqs';
import { useCallback } from 'react';

const parseAmountValue = (value: string | undefined) => {
  if (!value) return null;
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const formatAmountValue = (value: number | null) =>
  value === null ? undefined : String(value);

export function AmountFilterWrapper() {
  const [minAmount, setMinAmount] = useQueryState(
    'minAmount',
    parseAsFloat.withOptions({
      shallow: true,
    })
  );

  const [maxAmount, setMaxAmount] = useQueryState(
    'maxAmount',
    parseAsFloat.withOptions({
      shallow: true,
    })
  );

  const [, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({
      shallow: true,
    })
  );

  // Handle amount range filter changes
  const handleAmountRangeChange = useCallback(
    async (min: string | undefined, max: string | undefined) => {
      await setMinAmount(parseAmountValue(min));
      await setMaxAmount(parseAmountValue(max));
      await setPage(1);
    },
    [setMinAmount, setMaxAmount, setPage]
  );

  return (
    <AmountRangeFilter
      minAmount={formatAmountValue(minAmount)}
      maxAmount={formatAmountValue(maxAmount)}
      onAmountRangeChange={handleAmountRangeChange}
    />
  );
}
