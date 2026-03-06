'use client';

import { cn } from '@tuturuuu/utils/format';
import { format, isValid, parse } from 'date-fns';
import dayjs from 'dayjs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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

type FilterView = 'date' | 'month' | 'year';

interface FilterDraft {
  view: FilterView;
  startDate?: Date;
  endDate?: Date;
}

const DEFAULT_VIEW: FilterView = 'date';

const parseView = (value: string | null): FilterView => {
  if (value === 'date' || value === 'month' || value === 'year') {
    return value;
  }

  return DEFAULT_VIEW;
};

const normalizeDateForView = (
  view: FilterView,
  date: Date | undefined
): Date | undefined => {
  if (!date) return undefined;

  if (view === 'month') return dayjs(date).startOf('month').toDate();
  if (view === 'year') return dayjs(date).startOf('year').toDate();

  return date;
};

const normalizeDraft = (
  view: FilterView,
  startDate: Date | undefined,
  endDate: Date | undefined
): FilterDraft => {
  const normalizedStartDate = normalizeDateForView(view, startDate);
  let normalizedEndDate = normalizeDateForView(view, endDate);

  if (normalizedStartDate && !normalizedEndDate) {
    normalizedEndDate = normalizedStartDate;
  }

  if (
    normalizedStartDate &&
    normalizedEndDate &&
    normalizedStartDate > normalizedEndDate
  ) {
    normalizedEndDate = normalizedStartDate;
  }

  return {
    view,
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
  };
};

const parseDraftFromParams = (params: URLSearchParams): FilterDraft => {
  const view = parseView(params.get('view'));
  const startDate = parseSafeDate(params.get('startDate'));
  const endDate = parseSafeDate(params.get('endDate'));

  return normalizeDraft(view, startDate, endDate);
};

const isSameDraft = (left: FilterDraft, right: FilterDraft): boolean =>
  left.view === right.view &&
  toDateParam(left.startDate) === toDateParam(right.startDate) &&
  toDateParam(left.endDate) === toDateParam(right.endDate);

export function Filter({ className }: { className: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const paramsKey = searchParams.toString();

  const currentDraft = useMemo(
    () => parseDraftFromParams(new URLSearchParams(paramsKey)),
    [paramsKey]
  );

  const [draft, setDraft] = useState<FilterDraft>(currentDraft);

  useEffect(() => {
    setDraft((previousDraft) =>
      isSameDraft(previousDraft, currentDraft) ? previousDraft : currentDraft
    );
  }, [currentDraft]);

  const updateDraft = (
    nextView: FilterView,
    nextStartDate: Date | undefined,
    nextEndDate: Date | undefined
  ) => {
    setDraft(normalizeDraft(nextView, nextStartDate, nextEndDate));
  };

  const handleViewChange = (value: string) => {
    const nextView = parseView(value);
    updateDraft(nextView, draft.startDate, draft.endDate);
  };

  const handleStartDateChange = (nextStartDate?: Date) => {
    updateDraft(draft.view, nextStartDate, draft.endDate);
  };

  const handleEndDateChange = (nextEndDate?: Date) => {
    updateDraft(draft.view, draft.startDate, nextEndDate);
  };

  const resetFilter = () => {
    setDraft(normalizeDraft(DEFAULT_VIEW, undefined, undefined));
    router.push(pathname);
  };

  const applyFilter = () => {
    const params = new URLSearchParams();
    params.set('view', draft.view);

    if (draft.startDate) {
      params.set('startDate', format(draft.startDate, 'yyyy-MM-dd'));
    }

    if (draft.endDate) {
      params.set('endDate', format(draft.endDate, 'yyyy-MM-dd'));
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  const isDirty = () => !isSameDraft(draft, currentDraft);

  return (
    <div
      className={cn(
        'flex flex-col flex-wrap items-stretch gap-4 md:flex-row md:items-end',
        className
      )}
    >
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">Filter by</h2>
        <Select value={draft.view} onValueChange={handleViewChange}>
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

      {draft.view === 'date' && (
        <DateRangePicker
          startDate={draft.startDate}
          endDate={draft.endDate}
          setStartDate={handleStartDateChange}
          setEndDate={handleEndDateChange}
          className="flex w-full flex-col gap-4 md:w-auto md:flex-row"
        />
      )}

      {draft.view === 'month' && (
        <MonthRangePicker
          // date that is the first day of the month
          startMonth={
            draft.startDate
              ? dayjs(draft.startDate).startOf('month').toDate()
              : undefined
          }
          endMonth={
            draft.endDate
              ? dayjs(draft.endDate).startOf('month').toDate()
              : undefined
          }
          setStartMonth={handleStartDateChange}
          setEndMonth={handleEndDateChange}
          className="flex w-full flex-col gap-4 md:w-auto md:flex-row"
        />
      )}

      {draft.view === 'year' && (
        <YearRangePicker
          startYear={
            draft.startDate
              ? dayjs(draft.startDate).startOf('year').toDate()
              : undefined
          }
          endYear={
            draft.endDate
              ? dayjs(draft.endDate).startOf('year').toDate()
              : undefined
          }
          setStartYear={handleStartDateChange}
          setEndYear={handleEndDateChange}
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
