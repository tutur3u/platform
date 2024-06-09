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
} from '@/components/ui/table';
import useSearchParams from '@/hooks/useSearchParams';
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
import useTranslation from 'next-translate/useTranslation';
import { ReactNode, useState } from 'react';

interface DataTableProps<TData, TValue> {
  columns?: ColumnDef<TData, TValue>[];
  columnGenerator?: (
    t: Translate,
    extraColumns?: any[]
  ) => ColumnDef<TData, TValue>[];
  filters?: ReactNode[];
  extraColumns?: any[];
  newObjectTitle?: string;
  editContent?: ReactNode;
  namespace?: string;
  data?: TData[];
  count?: number;
  defaultVisibility?: VisibilityState;
  noBottomPadding?: boolean;
  disableSearch?: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  columnGenerator,
  filters,
  extraColumns,
  newObjectTitle,
  editContent,
  namespace = 'common',
  data,
  count,
  defaultVisibility = {},
  noBottomPadding,
  disableSearch,
}: DataTableProps<TData, TValue>) {
  const { t } = useTranslation(namespace);
  const searchParams = useSearchParams();

  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(defaultVisibility);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);

  const pageIndex = (Number(searchParams.get('page')) || 1) - 1;
  const pageSize = Number(searchParams.get('pageSize')) || 10;

  const table = useReactTable({
    data: data || [],
    columns: columnGenerator ? columnGenerator(t, extraColumns) : columns || [],
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
        namespace={namespace}
        table={table}
        newObjectTitle={newObjectTitle}
        editContent={editContent}
        filters={filters}
        extraColumns={extraColumns}
        disableSearch={disableSearch}
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
                  colSpan={columnGenerator?.(t)?.length || columns?.length || 1}
                  className="h-24 text-center"
                >
                  {data
                    ? `${t('common:no-results')}.`
                    : `${t('common:loading')}...`}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {noBottomPadding || count === undefined || (
        <DataTablePagination
          table={table}
          className="pointer-events-none hidden opacity-0 lg:block"
        />
      )}
      {count !== undefined && (
        <DataTablePagination
          table={table}
          count={count}
          className="bg-foreground/[0.025] dark:bg-foreground/5 inset-x-0 bottom-0 z-50 rounded-lg border px-4 py-2 backdrop-blur-xl lg:fixed lg:rounded-none lg:border-0 lg:border-t"
        />
      )}
    </div>
  );
}
