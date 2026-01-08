'use client';

import type { Table } from '@tanstack/react-table';
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronLeft,
  ChevronRight,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
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
  t?: any;

  setParams?: (params: { page?: number; pageSize?: string }) => void;
}

export function DataTablePagination<TData>({
  table,
  count,
  className,
  pageIndex: pageIndexProp,
  pageCount: pageCountProp,
  pageSize: pageSizeProp,
  additionalSizes,
  t,
  setParams,
}: DataTablePaginationProps<TData>) {
  // Use props if provided, otherwise fall back to table state
  // When setParams is provided, we're in server-side pagination mode
  const isServerSide = !!setParams;
  
  const pageIndex = pageIndexProp ?? table?.getState().pagination.pageIndex ?? 0;
  const pageSize = pageSizeProp ?? table?.getState().pagination.pageSize ?? 10;
  const pageCount = pageCountProp ?? table?.getPageCount() ?? 0;

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
    pageSize,
    ...(additionalSizes ?? []),
  ]
    .filter((value, index, self) => self.indexOf(value) === index)
    .sort((a, b) => a - b);

  const isPageOutOfRange = pageIndex + 1 > pageCount;
  const canGoPrevious = pageIndex > 0;
  const canGoNext = pageIndex < pageCount - 1;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-between gap-1 px-2 text-center md:flex-row',
        className
      )}
    >
      {count != null && count > 0 ? (
        <div className="flex-none text-muted-foreground text-sm">
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
          <p className="font-medium text-sm">
            {t?.('common.rows-per-page') ?? 'Rows per page'}
          </p>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => {
              if (isServerSide) {
                // Server-side pagination: only update via setParams
                setParams?.({ page: 1, pageSize: value });
              } else if (table) {
                // Client-side pagination: update table state
                table.setPageIndex(0);
                table.setPageSize(Number(value));
              }
            }}
          >
            <SelectTrigger className="h-8 w-17.5">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {sizes.map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-fit text-muted-foreground text-sm">
          {t?.('common.page') ?? 'Page'}{' '}
          <span className="font-semibold text-primary">
            {isPageOutOfRange ? 1 : pageIndex + 1}
          </span>
          {pageCount > 0 && (
            <>
              {' '}
              {t?.('common.of') ?? 'of'}{' '}
              <span className="font-semibold text-primary">
                {pageCount}
              </span>
            </>
          )}
        </div>

        {pageCount > 0 && (
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => {
                if (isServerSide) {
                  setParams?.({ page: 1 });
                } else if (table) {
                  table.resetRowSelection();
                  table.setPageIndex(0);
                }
              }}
              disabled={!canGoPrevious || isPageOutOfRange}
            >
              <span className="sr-only">Go to first page</span>
              <ArrowLeftToLine className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => {

                if (isServerSide) {
                  // pageIndex is 0-based, page param is 1-based
                  const newPage = pageIndex; // pageIndex when on page 2 (index 1) -> sends page: 1
                  setParams?.({ page: newPage });
                } else if (table) {
                  table.resetRowSelection();
                  table.previousPage();
                }
              }}
              disabled={!canGoPrevious || isPageOutOfRange}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => {
                if (isServerSide) {
                  // pageIndex is 0-based, page param is 1-based
                  const newPage = isPageOutOfRange ? 2 : pageIndex + 2;
                  setParams?.({ page: newPage });
                } else if (table) {
                  table.resetRowSelection();
                  table.nextPage();
                }
              }}
              disabled={!canGoNext && !isPageOutOfRange}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => {
                if (isServerSide) {
                  setParams?.({ page: pageCount });
                } else if (table) {
                  table.resetRowSelection();
                  table.setPageIndex(table.getPageCount() - 1);
                }
              }}
              disabled={!canGoNext && !isPageOutOfRange}
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
