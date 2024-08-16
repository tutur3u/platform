'use client';

import { DateRangePicker } from './date-range-picker';
import { MonthRangePicker } from './month-range-picker';
import { YearRangePicker } from './year-range-picker';
import { Button } from '@repo/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import { format } from 'date-fns';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export function Filter({ className }: { className: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [view, setView] = useState('date');

  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const [startMonth, setStartMonth] = useState<Date | undefined>(undefined);
  const [endMonth, setEndMonth] = useState<Date | undefined>(undefined);

  const [startYear, setStartYear] = useState<Date | undefined>(undefined);
  const [endYear, setEndYear] = useState<Date | undefined>(undefined);

  useEffect(() => {
    const viewParam = searchParams.get('view');
    if (viewParam === 'date' || viewParam === 'month' || viewParam === 'year') {
      setView(viewParam);
    } else {
      setView('date');
    }
  }, []);

  useEffect(() => {
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    setStartDate(startDateParam ? new Date(startDateParam) : undefined);
    setEndDate(endDateParam ? new Date(endDateParam) : undefined);

    const startMonthParam = searchParams.get('startMonth');
    const endMonthParam = searchParams.get('endMonth');
    setStartMonth(startMonthParam ? new Date(startMonthParam) : undefined);
    setEndMonth(endMonthParam ? new Date(endMonthParam) : undefined);

    const startYearParam = searchParams.get('startYear');
    const endYearParam = searchParams.get('endYear');
    setStartYear(startYearParam ? new Date(startYearParam) : undefined);
    setEndYear(endYearParam ? new Date(endYearParam) : undefined);
  }, [searchParams]);

  const resetFilter = () => {
    router.push(pathname);
  };

  const applyFilter = () => {
    const params = new URLSearchParams();

    if (view === 'date') {
      params.set('view', view);
      params.set('startDate', startDate ? format(startDate, 'yyyy-MM-dd') : '');
      params.set('endDate', endDate ? format(endDate, 'yyyy-MM-dd') : '');
    }
    if (view === 'month') {
      params.set('view', view);
      params.set('startMonth', startMonth ? format(startMonth, 'yyyy-MM') : '');
      params.set('endMonth', endMonth ? format(endMonth, 'yyyy-MM') : '');
    }
    if (view === 'year') {
      params.set('view', view);
      params.set('startYear', startYear ? format(startYear, 'yyyy') : '');
      params.set('endYear', endYear ? format(endYear, 'yyyy') : '');
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className={className}>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Filter by</h2>
        <Select value={view} onValueChange={(value) => setView(value)}>
          <SelectTrigger className="md:min-w-36 lg:min-w-48">
            <SelectValue placeholder="Filter by" />
          </SelectTrigger>
          <SelectContent className="md:min-w-36 lg:min-w-48">
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
          className="flex gap-4"
        />
      )}

      {view === 'month' && (
        <MonthRangePicker
          startMonth={startMonth}
          endMonth={endMonth}
          setStartMonth={setStartMonth}
          setEndMonth={setEndMonth}
          className="flex gap-4"
        />
      )}

      {view === 'year' && (
        <YearRangePicker
          startYear={startYear}
          endYear={endYear}
          setStartYear={setStartYear}
          setEndYear={setEndYear}
          className="flex gap-4"
        />
      )}

      <Button
        variant="outline"
        className="md:min-w-20 lg:min-w-24"
        onClick={resetFilter}
      >
        Reset
      </Button>
      <Button
        variant="default"
        className="md:min-w-20 lg:min-w-24"
        onClick={applyFilter}
      >
        Apply
      </Button>
    </div>
  );
}
