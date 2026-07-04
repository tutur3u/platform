'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  cloneElement,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

type OperationsTableSortValue = boolean | number | string | null | undefined;

export type OperationsTableColumn<Row> = {
  cellClassName?: string;
  className?: string;
  header: ReactNode;
  key: string;
  mobileHidden?: boolean;
  mobileRender?: (row: Row) => ReactNode;
  render: (row: Row) => ReactNode;
  sortValue?: (row: Row) => OperationsTableSortValue;
};

/**
 * Returns true when a click/keypress originated from an interactive element
 * (button, link, form control, menu item) so row activation never fights with
 * the controls rendered inside a row — most importantly the actions column.
 */
function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'a, button, input, select, textarea, label, [role="menuitem"], [data-no-row-activate]'
    )
  );
}

export function OperationsTable<Row>({
  ariaLabel,
  columns,
  getRowClassName,
  getRowId,
  minWidth = 'min-w-[760px]',
  onRowActivate,
  rowActivateLabel,
  rows,
}: {
  ariaLabel: string;
  columns: OperationsTableColumn<Row>[];
  getRowClassName?: (row: Row) => string | undefined;
  getRowId: (row: Row) => string;
  minWidth?: string;
  onRowActivate?: (row: Row) => void;
  rowActivateLabel?: (row: Row) => string;
  rows: Row[];
}) {
  const tableT = useTranslations();
  const handleRowClick = onRowActivate
    ? (row: Row) => (event: MouseEvent) => {
        if (isInteractiveTarget(event.target)) return;
        onRowActivate(row);
      }
    : undefined;
  const handleRowKeyDown = onRowActivate
    ? (row: Row) => (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (isInteractiveTarget(event.target)) return;
        event.preventDefault();
        onRowActivate(row);
      }
    : undefined;
  const interactiveRowClass = onRowActivate
    ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
    : undefined;
  const dataTableColumns: ColumnDef<Row>[] = columns.map((column) => ({
    id: column.key,
    accessorFn: column.sortValue
      ? (row) => column.sortValue?.(row) ?? ''
      : undefined,
    enableSorting: Boolean(column.sortValue),
    header: ({ column: tableColumn }) =>
      typeof column.header === 'string' ? (
        <DataTableColumnHeader
          column={tableColumn}
          t={tableT}
          title={column.header}
        />
      ) : (
        column.header
      ),
    cell: ({ row }) => (
      <div className={cn('align-middle', column.cellClassName)}>
        {column.render(row.original)}
      </div>
    ),
    meta: {
      cellClassName: column.cellClassName,
      className: column.className,
    },
  }));

  return (
    <>
      <section aria-label={ariaLabel} className="hidden min-w-0 lg:block">
        <div className="max-h-[min(68vh,44rem)] overflow-auto rounded-lg border border-border bg-card">
          <DataTable<Row, unknown>
            className="space-y-0"
            columns={dataTableColumns}
            data={rows}
            getRowId={getRowId}
            hidePagination
            hideToolbar
            namespace={ariaLabel}
            rowWrapper={(rowElement, rowData) => {
              const typedRow = rowElement as ReactElement<
                Record<string, unknown>
              >;
              const currentClassName =
                typeof typedRow.props.className === 'string'
                  ? typedRow.props.className
                  : undefined;

              return cloneElement(typedRow, {
                'aria-label': onRowActivate
                  ? rowActivateLabel?.(rowData)
                  : undefined,
                className: cn(
                  currentClassName,
                  'border-border/70 border-t transition-colors hover:bg-muted/20',
                  interactiveRowClass,
                  getRowClassName?.(rowData)
                ),
                onClick: handleRowClick?.(rowData),
                onKeyDown: handleRowKeyDown?.(rowData),
                tabIndex: onRowActivate ? 0 : undefined,
              });
            }}
            tableCardClassName="rounded-none border-0 bg-card shadow-none"
            tableClassName={cn(
              'w-full table-fixed text-left text-sm',
              minWidth
            )}
            t={tableT}
          />
        </div>
      </section>
      <div className="grid gap-3 lg:hidden">
        {rows.map((row) => {
          const primaryColumn = columns[0];
          const detailColumns = columns.slice(1).filter((column) => {
            return !column.mobileHidden;
          });

          return (
            <article
              aria-label={onRowActivate ? rowActivateLabel?.(row) : undefined}
              className={cn(
                'grid gap-3 rounded-lg border border-border bg-card p-3 text-sm',
                interactiveRowClass,
                getRowClassName?.(row)
              )}
              key={getRowId(row)}
              onClick={handleRowClick?.(row)}
              onKeyDown={handleRowKeyDown?.(row)}
              tabIndex={onRowActivate ? 0 : undefined}
            >
              {primaryColumn ? (
                <div className="min-w-0">{primaryColumn.render(row)}</div>
              ) : null}
              <dl className="grid min-w-0 gap-2 sm:grid-cols-2">
                {detailColumns.map((column) => (
                  <div
                    className={cn(
                      'min-w-0 rounded-md border border-border bg-muted/20 p-2',
                      column.cellClassName
                    )}
                    key={column.key}
                  >
                    <dt className="mb-1 truncate text-muted-foreground text-xs">
                      {column.header}
                    </dt>
                    <dd className="min-w-0">
                      {column.mobileRender?.(row) ?? column.render(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
    </>
  );
}
