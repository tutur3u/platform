'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useState } from 'react';
import { Card } from '../../card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../table';
import { DataTablePagination } from './data-table-pagination';
import { DataTableToolbar } from './data-table-toolbar';

export interface DataTableProps<TData, TValue> {
  hideToolbar?: boolean;
  hidePagination?: boolean;
  columns?: ColumnDef<TData, TValue>[];
  filters?: ReactNode[] | ReactNode;
  // biome-ignore lint/suspicious/noExplicitAny: <extraColumns type is not known ahead of time>
  extraColumns?: any[];
  // biome-ignore lint/suspicious/noExplicitAny: <extraData type is not known ahead of time>
  extraData?: any;
  newObjectTitle?: string;
  editContent?: ReactNode;
  namespace?: string | undefined;
  data?: TData[];
  count?: number | null;
  pageIndex?: number;
  pageSize?: number;
  defaultQuery?: string;
  defaultVisibility?: VisibilityState;
  disableSearch?: boolean;
  isEmpty?: boolean;
  toolbarImportContent?: ReactNode;
  toolbarExportContent?: ReactNode;
  className?: string;
  preserveParams?: string[];
  onRefresh?: () => void;
  // eslint-disable-next-line no-unused-vars
  onSearch?: (query: string) => void;
  // eslint-disable-next-line no-unused-vars
  onRowClick?: (row: TData) => void;
  onRowDoubleClick?: (row: TData) => void;
  // eslint-disable-next-line no-unused-vars
  setParams?: (params: { page?: number; pageSize?: string }) => void;
  resetParams?: () => void;
  // biome-ignore lint/suspicious/noExplicitAny: <t type is not known ahead of time>
  t?: any;
  columnGenerator?: (
    // biome-ignore lint/suspicious/noExplicitAny: <t type is not known ahead of time>
    t: any,
    namespace: string | undefined,
    // biome-ignore lint/suspicious/noExplicitAny: <extraColumns type is not known ahead of time>
    extraColumns?: any[],
    // biome-ignore lint/suspicious/noExplicitAny: <extraData type is not known ahead of time>
    extraData?: any
  ) => ColumnDef<TData, TValue>[];
  // Optional row wrapper for custom row rendering (e.g., context menu)
  rowWrapper?: (row: React.ReactElement, rowData: TData) => React.ReactElement;
}

export function DataTable<TData, TValue>({
  hideToolbar = false,
  hidePagination = false,
  columns,
  filters,
  extraColumns,
  extraData,
  newObjectTitle,
  editContent,
  namespace,
  data,
  count,
  pageIndex = 0,
  pageSize = 10,
  defaultQuery,
  defaultVisibility = {},
  disableSearch,
  isEmpty,
  t,
  toolbarImportContent,
  toolbarExportContent,
  className,
  onRefresh,
  onSearch,
  onRowClick,
  onRowDoubleClick,
  setParams,
  resetParams,
  columnGenerator,
  rowWrapper,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(defaultVisibility);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data: data || [],
    columns:
      columnGenerator && t
        ? columnGenerator(t, namespace, extraColumns, extraData)
        : columns || [],
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
        ? Math.max(Math.ceil((count || 0) / pageSize), 1)
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
    <div className={cn('space-y-4', className)}>
      {hideToolbar || (
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
          defaultQuery={defaultQuery}
          onSearch={onSearch || (() => {})}
          onRefresh={onRefresh || (() => {})}
          resetParams={resetParams || (() => {})}
          importContent={toolbarImportContent}
          exportContent={toolbarExportContent}
        />
      )}
      <Card>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      className="bg-foreground/5 font-semibold text-foreground/70 first:rounded-tl-xl last:rounded-tr-xl"
                    >
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
              table.getRowModel().rows.map((row) => {
                const tableRow = (
                  <TableRow
                    key={`${namespace}-${row.id}`}
                    data-state={row.getIsSelected() && 'selected'}
                    className="cursor-pointer"
                    onClick={() => onRowClick?.(row.original)}
                    onDoubleClick={() => onRowDoubleClick?.(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={`${namespace}-${cell.id}`}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
                return rowWrapper
                  ? rowWrapper(tableRow, row.original)
                  : tableRow;
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={
                    (namespace && columnGenerator?.(t, namespace)?.length) ||
                    columns?.length ||
                    1
                  }
                  className="h-24 text-center opacity-60"
                >
                  {data
                    ? `${t?.('common.no-results')}.`
                    : `${t?.('common.loading')}...`}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {hidePagination ||
        (count !== undefined && (
          <>
            <DataTablePagination
              t={t}
              table={table}
              count={count}
              className="rounded-lg border bg-foreground/[0.025] px-4 py-2 backdrop-blur-xl dark:bg-foreground/5"
              setParams={setParams}
            />
            <div className="h-4" />
          </>
        ))}
    </div>
  );
}
