'use client';

import { DataTablePagination } from './data-table-pagination';
import { DataTableToolbar } from './data-table-toolbar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/ui/table';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Translate } from 'next-translate';
import { ReactNode, useState } from 'react';

interface DataTableProps<TData, TValue> {
  columns?: ColumnDef<TData, TValue>[];
  filters?: ReactNode[];
  extraColumns?: any[];
  newObjectTitle?: string;
  editContent?: ReactNode;
  namespace?: string;
  data?: TData[];
  count?: number;
  pageIndex?: number;
  pageSize?: number;
  defaultVisibility?: VisibilityState;
  noBottomPadding?: boolean;
  disableSearch?: boolean;
  isEmpty?: boolean;
  onRefresh?: () => void;
  // eslint-disable-next-line no-unused-vars
  onSearch?: (query: string) => void;
  // eslint-disable-next-line no-unused-vars
  setParams?: (params: { page?: number; pageSize?: string }) => void;
  resetParams?: () => void;
  // eslint-disable-next-line no-unused-vars
  t?: Translate;
  columnGenerator?: (
    // eslint-disable-next-line no-unused-vars
    t: Translate,
    // eslint-disable-next-line no-unused-vars
    extraColumns?: any[]
  ) => ColumnDef<TData, TValue>[];
}

export function DataTable<TData, TValue>({
  columns,
  filters,
  extraColumns,
  newObjectTitle,
  editContent,
  namespace = 'common',
  data,
  count,
  pageIndex = 0,
  pageSize = 10,
  defaultVisibility = {},
  noBottomPadding,
  disableSearch,
  isEmpty,
  t,
  onRefresh,
  onSearch,
  setParams,
  resetParams,
  columnGenerator,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(defaultVisibility);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data: data || [],
    columns:
      columnGenerator && t ? columnGenerator(t, extraColumns) : columns || [],
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination: {
        pageIndex,
        pageSize,
      },
    },
    pageCount:
      count !== undefined
        ? Math.max(Math.ceil(count / pageSize), 1)
        : undefined,
    enableRowSelection: true,
    autoResetPageIndex: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  return (
    <div className="space-y-4">
      <DataTableToolbar
        hasData={!!data}
        namespace={namespace}
        table={table}
        newObjectTitle={newObjectTitle}
        editContent={editContent}
        filters={filters}
        extraColumns={extraColumns}
        disableSearch={disableSearch}
        t={t}
        isEmpty={isEmpty || !data?.length}
        onSearch={onSearch || (() => {})}
        onRefresh={onRefresh || (() => {})}
        resetParams={resetParams || (() => {})}
      />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className="text-foreground/70">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={
                    columnGenerator?.(t!)?.length || columns?.length || 1
                  }
                  className="h-24 text-center"
                >
                  {data
                    ? `${t?.('common:no-results')}.`
                    : `${t?.('common:loading')}...`}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {noBottomPadding || count === undefined || (
        <DataTablePagination
          t={t}
          table={table}
          className="pointer-events-none hidden opacity-0 lg:block"
          setParams={setParams}
        />
      )}
      {count !== undefined && (
        <DataTablePagination
          t={t}
          table={table}
          count={count}
          className="bg-foreground/[0.025] dark:bg-foreground/5 inset-x-0 bottom-0 z-50 rounded-lg border px-4 py-2 backdrop-blur-xl lg:fixed lg:rounded-none lg:border-0 lg:border-t"
          setParams={setParams}
        />
      )}
    </div>
  );
}
