import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
} from '@radix-ui/react-icons';
import { Table } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import useQuery from '@/hooks/useQuery';
import { cn } from '@/lib/utils';

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  count?: number;
  className?: string;
}

export function DataTablePagination<TData>({
  table,
  count,
  className,
}: DataTablePaginationProps<TData>) {
  const query = useQuery();

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-between gap-1 px-2 md:flex-row',
        className
      )}
    >
      <div className="text-muted-foreground flex-none text-sm">
        {table.getFilteredSelectedRowModel().rows.length} of{' '}
        {/* {table.getFilteredRowModel().rows.length} row(s) selected. */}
        {count} row(s) selected.
      </div>
      <div className="flex items-center gap-4 lg:gap-8">
        <div className="hidden items-center space-x-2 md:flex">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
              query.set({ pageSize: value });
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[5, 10, 20, 50, 100, 200, 500, 1000].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-full items-center justify-center text-sm font-medium md:w-[100px]">
          Page {table.getState().pagination.pageIndex + 1} of{' '}
          {table.getPageCount()}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => {
              table.resetRowSelection();
              table.setPageIndex(0);
              query.set({ page: 1 });
            }}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to first page</span>
            <DoubleArrowLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => {
              table.resetRowSelection();
              table.previousPage();
              query.set({ page: table.getState().pagination.pageIndex });
            }}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => {
              table.resetRowSelection();
              table.nextPage();
              query.set({ page: table.getState().pagination.pageIndex + 2 });
            }}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => {
              table.resetRowSelection();
              table.setPageIndex(table.getPageCount() - 1);
              query.set({ page: table.getPageCount() });
            }}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to last page</span>
            <DoubleArrowRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
