'use client';

import { DateRangePicker } from './date-range-picker';
import { MonthRangePicker } from './month-range-picker';
import { YearRangePicker } from './year-range-picker';
import { cn } from '@/lib/utils';
import { Button } from '@tutur3u/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tutur3u/ui/components/ui/select';
import { format } from 'date-fns';
import dayjs from 'dayjs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export function Filter({ className }: { className: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [view, setView] = useState('month');

  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  useEffect(() => {
    // If choosing start date but end date is not chosen
    // set end date to the same date as start date
    if (startDate && !endDate) setEndDate(startDate);
  }, [startDate, endDate]);

  useEffect(() => {
    const viewParam = searchParams.get('view');
    const view =
      viewParam === 'date' || viewParam === 'month' || viewParam === 'year'
        ? viewParam
        : 'date';

    setView(view);
  }, [searchParams.get('view')]);

  useEffect(() => {
    if (searchParams.toString() === '') return;

    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    if (startDateParam !== dayjs(startDate).format('yyyy-MM-dd'))
      setStartDate(startDateParam ? new Date(startDateParam) : undefined);

    if (endDateParam !== dayjs(endDate).format('yyyy-MM-dd'))
      setEndDate(endDateParam ? new Date(endDateParam) : undefined);
  }, [searchParams]);

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
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    return (
      (startDate && format(startDate, 'yyyy-MM-dd') !== startDateParam) ||
      (endDate && format(endDate, 'yyyy-MM-dd') !== endDateParam) ||
      (!startDate && startDateParam) ||
      (!endDate && endDateParam)
    );
  };

  return (
    <div
      className={cn(
        'flex flex-col flex-wrap items-stretch gap-4 md:flex-row md:items-end',
        className
      )}
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Filter by</h2>
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
        disabled={searchParams.toString() === ''}
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
