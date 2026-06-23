'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useTranslations } from 'next-intl';
import { HolidayRowActions } from './holiday-row-actions';
import type { HolidayManagementRow, HolidayUpdateValues } from './types';

type HolidaysTableProps = {
  holidays: HolidayManagementRow[];
  isLoading?: boolean;
  isMutating?: boolean;
  onDelete: (holidayId: string) => Promise<void> | void;
  onUpdate: (
    holidayId: string,
    values: HolidayUpdateValues
  ) => Promise<void> | void;
};

export function HolidaysTable({
  holidays,
  isLoading,
  isMutating,
  onDelete,
  onUpdate,
}: HolidaysTableProps) {
  const t = useTranslations('admin-holidays');

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">{t('date')}</TableHead>
              <TableHead>{t('name')}</TableHead>
              <TableHead className="w-24">{t('year')}</TableHead>
              <TableHead className="w-20 text-right">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell className="text-center" colSpan={4}>
                  {t('loading')}
                </TableCell>
              </TableRow>
            ) : holidays.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={4}
                >
                  {t('no_holidays')}
                </TableCell>
              </TableRow>
            ) : (
              holidays.map((holiday) => (
                <TableRow key={holiday.id}>
                  <TableCell className="font-mono">{holiday.date}</TableCell>
                  <TableCell className="min-w-56 font-medium">
                    {holiday.name}
                  </TableCell>
                  <TableCell>{holiday.year}</TableCell>
                  <TableCell className="text-right">
                    <HolidayRowActions
                      isMutating={isMutating}
                      onDelete={onDelete}
                      onUpdate={onUpdate}
                      row={holiday}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
