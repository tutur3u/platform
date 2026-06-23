'use client';

import { Calendar, Loader2, Plus } from '@tuturuuu/icons';
import type { VietnameseHoliday } from '@tuturuuu/types/primitives';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  usePathname,
  useRouter,
  useSearchParams,
} from '../../../lib/platform/next-navigation-shim';
import { HolidayBulkImportDialog } from './holiday-bulk-import-dialog';
import { HolidayFormDialog } from './holiday-form-dialog';
import { getHolidayYearOptions } from './holiday-utils';
import { HolidaysTable } from './holidays-table';
import type {
  HolidayBulkImportValues,
  HolidaysActionResult,
  HolidayUpdateValues,
  HolidayWriteValues,
} from './types';
import { useHolidaysActions } from './use-holidays-actions';

export type HolidaysClientPageProps = {
  bulkImportHolidays: (
    values: HolidayBulkImportValues
  ) => Promise<HolidaysActionResult>;
  createHoliday: (values: HolidayWriteValues) => Promise<HolidaysActionResult>;
  currentYear: number;
  deleteHoliday: (holidayId: string) => Promise<HolidaysActionResult>;
  holidays: VietnameseHoliday[];
  selectedYear: string;
  updateHoliday: (
    holidayId: string,
    values: HolidayUpdateValues
  ) => Promise<HolidaysActionResult>;
  workspaceId?: string;
};

export type { HolidaysActionResult };

function buildHref(pathname: string, params: URLSearchParams) {
  const query = params.toString();

  return query ? `${pathname}?${query}` : pathname;
}

export function HolidaysClientPage({
  bulkImportHolidays,
  createHoliday,
  currentYear,
  deleteHoliday,
  holidays,
  selectedYear,
  updateHoliday,
}: HolidaysClientPageProps) {
  const t = useTranslations('admin-holidays');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const yearOptions = useMemo(
    () => getHolidayYearOptions(currentYear, selectedYear),
    [currentYear, selectedYear]
  );
  const {
    bulkImportPending,
    createPending,
    handleBulkImport,
    handleCreate,
    handleDelete,
    handleUpdate,
    isMutating,
  } = useHolidaysActions({
    bulkImportHolidays,
    createHoliday,
    deleteHoliday,
    updateHoliday,
  });

  const handleYearChange = (year: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('year', year);
    router.push(buildHref(pathname, nextParams));
  };

  return (
    <div className="relative space-y-4">
      {isMutating ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/50 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-md border bg-background/90 px-4 py-2 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-muted-foreground text-sm">
              {t('loading')}
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-bold text-2xl">
            <Calendar className="h-6 w-6" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select onValueChange={handleYearChange} value={selectedYear}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder={t('year')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('all_years')}</SelectItem>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <HolidayBulkImportDialog
            isPending={bulkImportPending}
            onSubmit={handleBulkImport}
          />

          <HolidayFormDialog
            isPending={createPending}
            mode="create"
            onOpenChange={setCreateOpen}
            onSubmit={async (values) => {
              await handleCreate(values);
              setCreateOpen(false);
            }}
            open={createOpen}
            trigger={
              <Button disabled={isMutating} size="sm">
                <Plus className="h-4 w-4" />
                {t('add_holiday')}
              </Button>
            }
          />
        </div>
      </div>

      <Separator />

      <HolidaysTable
        holidays={holidays}
        isMutating={isMutating}
        onDelete={handleDelete}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
