'use client';

import { cn } from '@tuturuuu/utils/format';
import { format, isValid, parse } from 'date-fns';
import dayjs from 'dayjs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '../../../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../ui/select';
import { DateRangePicker } from './date-range-picker';
import { MonthRangePicker } from './month-range-picker';
import { YearRangePicker } from './year-range-picker';

const toDateParam = (date: Date | undefined): string =>
  date && isValid(date) ? format(date, 'yyyy-MM-dd') : '';

const parseSafeDate = (
  dateStr: string | null | undefined
): Date | undefined => {
  if (!dateStr) return undefined;
  const parsed = parse(dateStr, 'yyyy-MM-dd', new Date());
  return isValid(parsed) ? parsed : undefined;
};

export function Filter({ className }: { className: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const paramsKey = searchParams.toString();

  const [view, setView] = useState('date');

  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  useEffect(() => {
    // If choosing start date but end date is not chosen
    // set end date to the same date as start date
    if (startDate && !endDate) setEndDate(startDate);
  }, [startDate, endDate]);

  useEffect(() => {
    const params = new URLSearchParams(paramsKey);
    const viewParam = params.get('view');
    const nextView =
      viewParam === 'date' || viewParam === 'month' || viewParam === 'year'
        ? viewParam
        : 'date';

    setView((prev) => (prev === nextView ? prev : nextView));

    const startDateParam = params.get('startDate') || '';
    const endDateParam = params.get('endDate') || '';
    const nextStartDate = parseSafeDate(startDateParam);
    const nextEndDate = parseSafeDate(endDateParam);

    setStartDate((prev) =>
      toDateParam(prev) === (nextStartDate ? startDateParam : '')
        ? prev
        : nextStartDate
    );
    setEndDate((prev) =>
      toDateParam(prev) === (nextEndDate ? endDateParam : '')
        ? prev
        : nextEndDate
    );
  }, [paramsKey]);

  const resetFilter = () => {
    setView('date');
    setStartDate(undefined);
    setEndDate(undefined);
    router.push(pathname);
  };

  const applyFilter = () => {
    const params = new URLSearchParams();
    params.set('view', view);

    if (startDate) params.set('startDate', format(startDate, 'yyyy-MM-dd'));
    if (endDate) params.set('endDate', format(endDate, 'yyyy-MM-dd'));

    router.push(`${pathname}?${params.toString()}`);
  };

  const isDirty = () => {
    const startDateParam = searchParams.get('startDate') || '';
    const endDateParam = searchParams.get('endDate') || '';

    const currentStart = toDateParam(startDate);
    const currentEnd = toDateParam(endDate);

    return currentStart !== startDateParam || currentEnd !== endDateParam;
  };

  return (
    <div
      className={cn(
        'flex flex-col flex-wrap items-stretch gap-4 md:flex-row md:items-end',
        className
      )}
    >
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">Filter by</h2>
        <Select value={view} onValueChange={(value) => setView(value)}>
          <SelectTrigger className="w-full lg:min-w-48">
            <SelectValue placeholder="Filter by" />
          </SelectTrigger>
          <SelectContent className="w-full lg:min-w-48">
            <SelectItem value="date">Date range</SelectItem>
            <SelectItem value="month">Month range</SelectItem>
            <SelectItem value="year">Year range</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {view === 'date' && (
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
          className="flex w-full flex-col gap-4 md:w-auto md:flex-row"
        />
      )}

      {view === 'month' && (
        <MonthRangePicker
          // date that is the first day of the month
          startMonth={
            startDate ? dayjs(startDate).startOf('month').toDate() : undefined
          }
          endMonth={
            endDate ? dayjs(endDate).startOf('month').toDate() : undefined
          }
          setStartMonth={setStartDate}
          setEndMonth={setEndDate}
          className="flex w-full flex-col gap-4 md:w-auto md:flex-row"
        />
      )}

      {view === 'year' && (
        <YearRangePicker
          startYear={
            startDate ? dayjs(startDate).startOf('year').toDate() : undefined
          }
          endYear={
            endDate ? dayjs(endDate).startOf('year').toDate() : undefined
          }
          setStartYear={setStartDate}
          setEndYear={setEndDate}
          className="flex w-full flex-col gap-4 md:w-auto md:flex-row"
        />
      )}

      <Button
        variant="outline"
        className="w-full md:w-auto lg:min-w-24"
        onClick={resetFilter}
        disabled={paramsKey === ''}
      >
        Reset
      </Button>
      <Button
        variant="default"
        className="w-full md:w-auto lg:min-w-24"
        onClick={applyFilter}
        disabled={!isDirty()}
      >
        Apply
      </Button>
    </div>
  );
}
