'use client';

import type { Table } from '@tanstack/react-table';
import { cn } from '@tuturuuu/utils/format';
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../../button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../select';
import { Separator } from '../../separator';

interface DataTablePaginationProps<TData> {
  table?: Table<TData>;
  count?: number | null;
  className?: string;
  pageIndex?: number;
  pageCount?: number;
  pageSize?: number;
  additionalSizes?: number[];
  t?: (key: string) => string;
  // eslint-disable-next-line no-unused-vars
  setParams?: (params: { page?: number; pageSize?: string }) => void;
}

export function DataTablePagination<TData>({
  table,
  count,
  className,
  pageIndex,
  pageCount,
  pageSize,
  additionalSizes,
  t,
  setParams,
}: DataTablePaginationProps<TData>) {
  // filter duplicate and sort sizes
  const sizes = [
    5,
    10,
    20,
    50,
    100,
    200,
    500,
    1000,
    pageSize ?? 10,
    ...(additionalSizes ?? []),
  ]
    .filter((value, index, self) => self.indexOf(value) === index)
    .sort((a, b) => a - b);

  const isPageOutOfRange = table
    ? table.getState().pagination.pageIndex + 1 > table.getPageCount()
    : pageIndex !== undefined
      ? pageIndex + 1 > (pageCount ?? 1)
      : false;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-between gap-1 px-2 text-center md:flex-row',
        className
      )}
    >
      {count !== undefined && count !== null && count > 0 ? (
        <div className="flex-none text-sm text-muted-foreground">
          {/* {locale === 'vi' || locale === 'vi-VN' ? t('common.selected') : null}{' '} */}
          {/* <span className="text-primary font-semibold">
            {table ? table.getFilteredSelectedRowModel().rows.length : 0}
          </span>{' '}
          {t('common.of')}{' '} */}
          {/* {table.getFilteredRowModel().rows.length} row(s) selected. */}
          <span className="font-semibold text-primary">{count}</span>{' '}
          {t?.('common.result(s)') ?? 'result(s)'}
          {/* {locale !== 'vi' && locale !== 'vi-VN'
            ? ' ' + t('common.selected').toLowerCase()
            : null} */}
          .
        </div>
      ) : (
        <div />
      )}

      <Separator className="my-1 md:hidden" />

      <div className="flex flex-wrap items-center justify-center gap-2 text-center md:gap-4 lg:gap-8">
        <div className="hidden items-center space-x-2 md:flex">
          <p className="text-sm font-medium">
            {t?.('common.rows-per-page') ?? 'Rows per page'}
          </p>
          <Select
            value={`${pageSize ?? table?.getState().pagination.pageSize ?? 0}`}
            onValueChange={(value) => {
              if (table) {
                table.setPageIndex(0);
                table.setPageSize(Number(value));
              }

              setParams?.({ page: 1, pageSize: value });
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue
                placeholder={
                  pageSize ?? table?.getState().pagination.pageSize ?? 0
                }
              />
            </SelectTrigger>
            <SelectContent side="top">
              {sizes.map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-fit text-sm text-muted-foreground">
          {t?.('common.page') ?? 'Page'}{' '}
          <span className="font-semibold text-primary">
            {isPageOutOfRange
              ? 1
              : (pageIndex ?? table?.getState().pagination.pageIndex ?? 0) + 1}
          </span>
          {(pageCount ?? table?.getPageCount() ?? 0) > 0 && (
            <>
              {' '}
              {t?.('common.of') ?? 'of'}{' '}
              <span className="font-semibold text-primary">
                {pageCount ?? table?.getPageCount() ?? 1}
              </span>
            </>
          )}
        </div>

        {(pageCount ?? table?.getPageCount() ?? 0) > 0 && (
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => {
                if (table) {
                  table.resetRowSelection();
                  table.setPageIndex(0);
                }

                setParams?.({ page: 1 });
              }}
              disabled={
                (pageIndex !== undefined
                  ? pageIndex <= 0
                  : table && !table.getCanPreviousPage()) || isPageOutOfRange
              }
            >
              <span className="sr-only">Go to first page</span>
              <ArrowLeftToLine className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => {
                if (table) {
                  table.resetRowSelection();
                  table.previousPage();
                }

                setParams?.({
                  page:
                    pageIndex ?? table?.getState().pagination.pageIndex ?? 0,
                });
              }}
              disabled={
                (pageIndex !== undefined
                  ? pageIndex <= 0
                  : table && !table.getCanPreviousPage()) || isPageOutOfRange
              }
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => {
                if (table) {
                  table.resetRowSelection();
                  table.nextPage();
                }

                setParams?.({
                  page: isPageOutOfRange
                    ? 2
                    : (pageIndex ??
                        table?.getState().pagination.pageIndex ??
                        0) + 2,
                });
              }}
              disabled={
                (pageIndex !== undefined
                  ? pageIndex >= (pageCount ?? 0) - 1
                  : table && !table.getCanNextPage()) && !isPageOutOfRange
              }
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => {
                if (table) {
                  table.resetRowSelection();
                  table.setPageIndex(table.getPageCount() - 1);
                }

                setParams?.({
                  page: pageCount ?? table?.getPageCount() ?? 1,
                });
              }}
              disabled={
                (pageIndex !== undefined
                  ? pageIndex >= (pageCount ?? 0) - 1
                  : table && !table.getCanNextPage()) && !isPageOutOfRange
              }
            >
              <span className="sr-only">Go to last page</span>
              <ArrowRightToLine className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
