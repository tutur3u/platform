'use client';

import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Label } from '../ui/label';
import { useCallback } from 'react';
import moment from 'moment';
import { DateRange } from 'react-day-picker';

interface DateFilterProps {
  label?: string;
  placeholder?: string;
}

const DateRangeInput = ({ label, placeholder }: DateFilterProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams()!;

  // Get a new searchParams string by merging the current
  // searchParams with a provided key/value pair
  const createQueryString = useCallback(
    (
      valuePairs:
        | { name: string; value: string }
        | { name: string; value: string }[]
    ) => {
      const params = new URLSearchParams(searchParams);

      if (Array.isArray(valuePairs))
        valuePairs.forEach(({ name, value }) => {
          if (value) params.set(name, value);
          else params.delete(name);
        });
      else {
        const { name, value } = valuePairs;
        if (value) params.set(name, value);
        else params.delete(name);
      }

      return params.toString();
    },
    [searchParams]
  );

  const range = {
    from: searchParams.get('from')
      ? moment(searchParams.get('from')).toDate()
      : undefined,
    to: searchParams.get('to')
      ? moment(searchParams.get('to')).toDate()
      : undefined,
  };

  const setRange = (range?: DateRange) => {
    const query = createQueryString([
      {
        name: 'from',
        value: range?.from ? moment(range.from).toISOString() : '',
      },
      { name: 'to', value: range?.to ? moment(range.to).toISOString() : '' },
    ]);

    router.push(`${pathname}?${query}`);
  };

  return (
    <div className="grid w-full items-center gap-1.5">
      {label && <Label>{label}</Label>}
      <DatePickerWithRange
        range={range}
        setRange={setRange}
        placeholder={placeholder}
      />
    </div>
  );
};

export default DateRangeInput;
